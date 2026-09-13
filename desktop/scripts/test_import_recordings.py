#!/usr/bin/env python3
"""Exercise USB import safety against a temporary recording tree, without a device."""

import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import struct
import sys
import threading
import tempfile
import unittest
from unittest import mock


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from rootlens_import import core as IMPORTER


class LocalRecordingAdb(IMPORTER.Adb):
    """Run the actual read-only Android shell checks against a local fixture tree."""

    def __init__(self):
        super().__init__("unused")
        self.pulled = []
        self.checksum_calls = 0
        self.fail_on = None
        self.corrupt_on = None

    def shell(self, command, timeout=60):
        result = subprocess.run(
            ["/bin/sh", "-c", command], capture_output=True, timeout=timeout, check=True
        )
        return result.stdout.decode("utf-8").strip()

    def checksums(self, remote, files=IMPORTER.FILES):
        self.checksum_calls += 1
        # macOS does not ship sha256sum; all remote read/metadata/completeness checks
        # still use the actual Adb implementation and shell expressions.
        return {name: IMPORTER.checksum(Path(remote) / name) for name in files}

    def sizes(self, remote):
        # Android stat -c and macOS stat differ; use host stat for the fixture.
        return {name: (Path(remote) / name).stat().st_size for name in IMPORTER.FILES}

    def pull(self, remote, local):
        name = Path(remote).name
        self.pulled.append(name)
        if name == self.fail_on:
            Path(local).write_bytes(b"interrupted USB copy")
            raise IMPORTER.ImportFailure("USB disconnected")
        shutil.copyfile(remote, local)
        if name == self.corrupt_on:
            Path(local).write_bytes(b"corrupted transfer")


@unittest.skipUnless(os.name == "posix", "local Android-shell fixture requires /bin/sh")
class ImportClipTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.remote_root = self.base / "device recordings"
        self.output = self.base / "Mentra"
        self.staging = self.base / ".Mentra-importing"
        for directory in (self.remote_root, self.output, self.staging):
            directory.mkdir()
        self.name = "rec-20260911T083000.000Z"
        self.source = self.remote_root / self.name
        self.source.mkdir()
        self.adb = LocalRecordingAdb()
        (self.source / "rgb.mp4").write_bytes(b"complete video fixture")
        (self.source / "frames.jsonl").write_bytes(b'{"frame_index":0}\n')
        (self.source / "imu.jsonl").write_bytes(b'{"sensor":"gyroscope"}\n')
        self.metadata = {
            "schema": "rootlens.mentra.raw.v1",
            "unit_id": "unit_fixture_20260911T083000000Z_00000000",
            "site_id": "fixture",
            "files": list(IMPORTER.FILES),
            "created_at": "2026-09-11T08:30:00.000Z",
            "description": "撮影データ",
        }
        self.write_metadata()
        # Internal QA files stay on the device and must not leak into delivery.
        (self.source / "sync_report.json").write_bytes(b'{"internal":true}')
        self.destination = self.output / self.metadata["unit_id"]

    def write_metadata(self):
        (self.source / "metadata.json").write_text(
            json.dumps(self.metadata, ensure_ascii=False), encoding="utf-8"
        )

    def import_clip(self):
        return IMPORTER.import_clip(
            self.adb, str(self.remote_root), self.name, self.output, self.staging,
            site_id="fixture", log=lambda message: None,
        )

    def tree_bytes(self):
        return {path.name: path.read_bytes() for path in self.source.iterdir() if path.is_file()}

    def assert_nothing_exposed(self):
        self.assertEqual(list(self.output.iterdir()), [])
        self.assertEqual(list(self.staging.iterdir()), [])

    def test_import_then_repeat_verifies_every_file_and_retains_source(self):
        original = self.tree_bytes()
        self.assertEqual(self.import_clip(), "imported")
        self.assertEqual({path.name for path in self.destination.iterdir()}, set(IMPORTER.FILES))
        for name in IMPORTER.FILES:
            self.assertEqual((self.destination / name).read_bytes(), original[name])
        self.assertEqual(self.adb.pulled, list(IMPORTER.FILES))
        self.assertEqual(self.adb.checksum_calls, 1)
        self.assertEqual(self.import_clip(), "existing")
        self.assertEqual(self.adb.pulled, list(IMPORTER.FILES))
        self.assertEqual(self.adb.checksum_calls, 2)
        self.assertEqual(self.tree_bytes(), original)
        self.assertEqual(list(self.staging.iterdir()), [])

    def test_clip_ready_is_reported_only_after_atomic_publish_and_verification(self):
        events = []
        def progress(event):
            events.append(event)
            self.assertEqual(self.destination.exists(), event.state == "ready")
        IMPORTER.import_clip(self.adb, str(self.remote_root), self.name, self.output,
                             self.staging, site_id="fixture", log=lambda _: None, on_clip=progress)
        self.assertEqual([event.state for event in events],
                         ["discovering", "importing", "verifying", "ready"])
        self.assertEqual(events[-1].path, self.destination)

    def test_repeat_connection_reports_ready_without_copying_again(self):
        self.import_clip()
        events = []
        IMPORTER.import_clip(self.adb, str(self.remote_root), self.name, self.output,
                             self.staging, site_id="fixture", log=lambda _: None, on_clip=events.append)
        self.assertEqual([event.state for event in events], ["discovering", "verifying", "ready"])
        self.assertEqual(len(self.adb.pulled), 4)

    def test_corruption_never_reports_ready(self):
        self.adb.corrupt_on = "imu.jsonl"
        events = []
        with self.assertRaises(IMPORTER.ImportFailure):
            IMPORTER.import_clip(self.adb, str(self.remote_root), self.name, self.output,
                                 self.staging, site_id="fixture", log=lambda _: None, on_clip=events.append)
        self.assertNotIn("ready", [event.state for event in events])
        self.assertFalse(self.destination.exists())

    def test_crash_recovery_removes_only_owned_staging_directories(self):
        abandoned = self.staging / (self.name + "-ab12_cd3")
        abandoned.mkdir()
        (abandoned / "rgb.mp4").write_bytes(b"partial copy")
        other = self.staging / "other-work"
        other.mkdir()
        linked = self.staging / (self.name + "-abcdefgh")
        linked.symlink_to(self.source, target_is_directory=True)
        original = self.tree_bytes()
        with IMPORTER.import_lock(self.staging):
            IMPORTER.recover_staging(self.staging)
        self.assertFalse(abandoned.exists())
        self.assertTrue(other.is_dir())
        self.assertTrue(linked.is_symlink())
        self.assertEqual(self.tree_bytes(), original)

    def test_desktop_metadata_does_not_break_verified_duplicate_import(self):
        self.assertEqual(self.import_clip(), "imported")
        for filename in (".DS_Store", "Thumbs.db", "desktop.ini"):
            (self.destination / filename).write_bytes(b"desktop folder metadata")
        self.assertEqual(self.import_clip(), "existing")
        self.assertEqual(self.adb.checksum_calls, 2)
        self.assertEqual(len(self.adb.pulled), 4)
        metadata = json.loads((self.destination / "metadata.json").read_text(encoding="utf-8"))
        self.assertEqual(metadata["description"], "撮影データ")
        for filename in (".DS_Store", "Thumbs.db", "desktop.ini"):
            self.assertTrue((self.destination / filename).is_file())

    def test_desktop_metadata_exception_rejects_nested_folders(self):
        self.import_clip()
        nested = self.destination / "Thumbs.db"
        nested.mkdir()
        (nested / "private.txt").write_text("unrelated local file")
        with self.assertRaises(IMPORTER.ImportFailure):
            self.import_clip()
        self.assertEqual(len(self.adb.pulled), 4)

    def test_sync_discovers_all_clips_before_copying_and_recovers_under_lock(self):
        names = [self.name, "rec-20260911T090000.000Z"]
        events = []
        stale = self.staging / (self.name + "-ab12_cd3")
        stale.mkdir()
        def copy_one(*args, **kwargs):
            self.assertFalse(stale.exists())
            self.assertEqual([event.name for event in events[:2]], names)
            with self.assertRaises(IMPORTER.ImportFailure):
                with IMPORTER.import_lock(self.staging):
                    pass
            if args[2] == names[0]:
                raise IMPORTER.ImportFailure("fixture disconnect")
            return "imported"
        with mock.patch.object(IMPORTER, "find_adb", return_value="unused"), \
                mock.patch.object(IMPORTER, "Adb", return_value=self.adb), \
                mock.patch.object(self.adb, "connect", return_value="USB_FIXTURE"), \
                mock.patch.object(self.adb, "package", return_value="io.rootlens.mentra.debug"), \
                mock.patch.object(self.adb, "clip_names", return_value=names), \
                mock.patch.object(IMPORTER, "import_clip", side_effect=copy_one):
            result = IMPORTER.import_recordings(output=self.output.resolve(), on_clip=events.append, log=lambda _: None)
        self.assertEqual((result.imported, result.failed), (1, 1))
        self.assertEqual(events[-1].state, "error")
        self.assertEqual(events[-1].name, self.name)

    def test_disconnect_cleans_partial_copy_without_exposing_it(self):
        original = self.tree_bytes()
        self.adb.fail_on = "imu.jsonl"
        with self.assertRaisesRegex(IMPORTER.ImportFailure, "USB disconnected"):
            self.import_clip()
        self.assert_nothing_exposed()
        self.assertEqual(self.tree_bytes(), original)
        self.adb.fail_on = None
        self.assertEqual(self.import_clip(), "imported")

    def test_corrupt_transfer_is_rejected_before_publication(self):
        self.adb.corrupt_on = "frames.jsonl"
        with self.assertRaises(IMPORTER.ImportFailure):
            self.import_clip()
        self.assert_nothing_exposed()

    def test_tampered_existing_clip_is_not_overwritten(self):
        self.assertEqual(self.import_clip(), "imported")
        existing = self.destination / "imu.jsonl"
        existing.write_bytes(b"user changed this file")
        with self.assertRaises(IMPORTER.ImportFailure):
            self.import_clip()
        self.assertEqual(existing.read_bytes(), b"user changed this file")
        self.assertEqual(len(self.adb.pulled), 4)
        self.assertTrue((self.source / "imu.jsonl").is_file())

    def test_each_incomplete_marker_prevents_any_copy(self):
        for marker in ("rgb.mp4.partial", "metadata.json.partial", "failure.json"):
            with self.subTest(marker=marker):
                path = self.source / marker
                path.write_bytes(b"unfinished")
                self.assertEqual(self.import_clip(), "incomplete")
                self.assertEqual(self.adb.pulled, [])
                self.assert_nothing_exposed()
                path.unlink()

    def test_missing_or_empty_required_file_prevents_copy(self):
        path = self.source / "imu.jsonl"
        path.unlink()
        self.assertEqual(self.import_clip(), "incomplete")
        path.touch()
        self.assertEqual(self.import_clip(), "incomplete")
        self.assertEqual(self.adb.pulled, [])
        self.assert_nothing_exposed()

    def test_incorrect_metadata_unit_id_is_rejected(self):
        self.metadata["unit_id"] = "0" * 64
        self.write_metadata()
        with self.assertRaises(IMPORTER.ImportFailure):
            self.import_clip()
        self.assert_nothing_exposed()

    def test_clip_that_becomes_incomplete_during_transfer_is_rejected(self):
        original_pull = self.adb.pull

        def pull_and_mark_incomplete(remote, local):
            original_pull(remote, local)
            if Path(remote).name == "metadata.json":
                (self.source / "failure.json").write_bytes(b"capture failed")

        self.adb.pull = pull_and_mark_incomplete
        with self.assertRaises(IMPORTER.ImportFailure):
            self.import_clip()
        self.assert_nothing_exposed()

    def test_source_file_symlink_is_not_copied(self):
        target = self.base / "other-imu.jsonl"
        target.write_bytes(b"unrelated file")
        path = self.source / "imu.jsonl"
        path.unlink()
        path.symlink_to(target)
        self.assertEqual(self.import_clip(), "incomplete")
        self.assertEqual(self.adb.pulled, [])
        self.assert_nothing_exposed()
        self.assertEqual(target.read_bytes(), b"unrelated file")

    def test_source_clip_symlink_is_not_copied(self):
        target = self.remote_root / "hidden-original"
        self.source.rename(target)
        self.source.symlink_to(target, target_is_directory=True)
        self.assertEqual(self.import_clip(), "incomplete")
        self.assertEqual(self.adb.pulled, [])
        self.assert_nothing_exposed()
        self.assertTrue((target / "rgb.mp4").is_file())

    def test_existing_destination_symlink_is_not_followed_or_replaced(self):
        target = self.base / "other-destination"
        target.mkdir()
        self.destination.symlink_to(target, target_is_directory=True)
        with self.assertRaises(IMPORTER.ImportFailure):
            self.import_clip()
        self.assertTrue(self.destination.is_symlink())
        self.assertEqual(list(target.iterdir()), [])
        self.assertEqual(self.adb.pulled, [])

    def test_staging_symlink_into_ready_output_is_rejected_before_copy(self):
        exposed = self.output / "visible-partials"
        exposed.mkdir()
        self.staging.rmdir()
        self.staging.symlink_to(exposed, target_is_directory=True)
        with mock.patch.object(IMPORTER, "find_adb", return_value="unused"), \
                mock.patch.object(IMPORTER, "Adb", return_value=self.adb), \
                mock.patch.object(self.adb, "connect", return_value="USB_FIXTURE"), \
                mock.patch.object(self.adb, "package", return_value="io.rootlens.mentra.debug"), \
                mock.patch.object(self.adb, "clip_names", return_value=[self.name]), \
                mock.patch.object(IMPORTER, "import_clip", wraps=IMPORTER.import_clip) as import_one, \
                mock.patch("sys.stdout", new_callable=io.StringIO), \
                mock.patch("sys.stderr", new_callable=io.StringIO):
            status = IMPORTER.main(["--output", str(self.output)])
        self.assertEqual(status, 1)
        import_one.assert_not_called()
        self.assertEqual(list(exposed.iterdir()), [])

    def test_insufficient_pc_space_prevents_copy(self):
        with mock.patch.object(IMPORTER.shutil, "disk_usage", return_value=mock.Mock(free=0)):
            with self.assertRaises(IMPORTER.ImportFailure):
                self.import_clip()
        self.assertEqual(self.adb.pulled, [])
        self.assert_nothing_exposed()

    def test_cancel_after_partial_transfer_cleans_stage_and_retains_source(self):
        original = self.tree_bytes()
        cancelled = threading.Event()
        self.adb.cancel_event = cancelled
        pull = self.adb.pull
        def cancel_after_pull(remote, local):
            pull(remote, local)
            cancelled.set()
        with mock.patch.object(self.adb, "pull", side_effect=cancel_after_pull):
            with self.assertRaises(IMPORTER.ImportCancelled):
                self.import_clip()
        self.assert_nothing_exposed()
        self.assertEqual(self.tree_bytes(), original)

    def test_cancel_during_existing_verification_does_not_touch_clip(self):
        self.assertEqual(self.import_clip(), "imported")
        original = {p.name: p.read_bytes() for p in self.destination.iterdir()}
        cancelled = threading.Event()
        cancelled.set()
        with self.assertRaises(IMPORTER.ImportCancelled):
            IMPORTER.verify_local(self.destination, self.adb.checksums(str(self.source)),
                                  self.metadata, cancel_event=cancelled)
        self.assertEqual({p.name: p.read_bytes() for p in self.destination.iterdir()}, original)

    def test_import_session_rejects_symlink_output_before_writing(self):
        target = self.base / "private-data"
        target.mkdir()
        linked = self.base / "linked-output"
        linked.symlink_to(target, target_is_directory=True)
        with mock.patch.object(IMPORTER, "Adb", return_value=self.adb), mock.patch.object(
            IMPORTER, "find_adb", return_value="unused"
        ), mock.patch.object(self.adb, "connect"), mock.patch.object(
            self.adb, "package", return_value="io.rootlens.mentra.debug"
        ):
            with self.assertRaises(IMPORTER.ImportFailure):
                IMPORTER.import_recordings(output=linked)
        self.assertEqual(list(target.iterdir()), [])


class AdbTransportTests(unittest.TestCase):
    def test_environment_does_not_redirect_to_wireless_or_remote_server(self):
        overrides = {
            "ANDROID_SERIAL": "192.0.2.5:5555",
            "ADB_SERVER_SOCKET": "tcp:192.0.2.5:5037",
            "ANDROID_ADB_SERVER_ADDRESS": "192.0.2.5",
            "ANDROID_ADB_SERVER_PORT": "5038",
        }
        with mock.patch.dict(os.environ, overrides):
            adb = IMPORTER.Adb("adb")
        for key in overrides:
            self.assertNotIn(key, adb.environment)
        self.assertEqual(adb.selector, ["-d"])

    def test_connection_is_pinned_to_usb_transport_and_never_falls_back(self):
        adb = IMPORTER.Adb("fixture-adb")
        calls = []
        def run(*args, **kwargs):
            calls.append((list(adb.selector), args))
            if args[0] == "shell":
                raise IMPORTER.ImportFailure("device disconnected")
            return "MENTRA_USB" if args[0] == "get-serialno" else ""
        with mock.patch.object(adb, "run", side_effect=run), mock.patch.object(
            adb, "usb_transport_id", return_value=42
        ):
            self.assertEqual(adb.connect(), "MENTRA_USB")
            with self.assertRaises(IMPORTER.ImportFailure):
                adb.shell("pm path io.rootlens.mentra.debug")
        self.assertEqual(
            calls, [(["-d"], ("start-server",)),
                    (["-t", "42"], ("get-serialno",)),
                    (["-t", "42"], ("shell", "pm path io.rootlens.mentra.debug"))],
        )

    def transport_socket(self, response):
        channel = mock.MagicMock()
        pending = bytearray(response)
        def recv(size):
            # TCP is a byte stream; each read can return less than requested.
            result = bytes(pending[:min(size, 2)])
            del pending[:len(result)]
            return result
        channel.recv.side_effect = recv
        channel.__enter__.return_value = channel
        return channel

    def test_usb_transport_is_selected_atomically_without_platform_listing(self):
        channel = self.transport_socket(b"OKAY" + struct.pack("<Q", 42))
        with mock.patch.object(IMPORTER.socket, "create_connection", return_value=channel) as connect:
            self.assertEqual(IMPORTER.Adb("adb").usb_transport_id(), 42)
        connect.assert_called_once_with(("127.0.0.1", 5037), timeout=5)
        channel.sendall.assert_called_once_with(b"000ehost:tport:usb")

    def test_no_usb_or_ambiguous_usb_is_rejected_by_server(self):
        adb = IMPORTER.Adb("fixture-adb")
        for message in (b"no devices found", b"more than one device"):
            response = b"FAIL" + f"{len(message):04x}".encode() + message
            channel = self.transport_socket(response)
            with self.subTest(message=message), mock.patch.object(adb, "run"), mock.patch.object(
                IMPORTER.socket, "create_connection", return_value=channel
            ):
                with self.assertRaises(IMPORTER.ImportFailure):
                    adb.connect()
                self.assertEqual(adb.selector, ["-d"])

    def test_malformed_truncated_or_zero_transport_response_is_rejected(self):
        for response in (b"", b"NOPE", b"FAILxxxx", b"OKAY\0", b"OKAY" + b"\0" * 8):
            channel = self.transport_socket(response)
            with self.subTest(response=response), mock.patch.object(
                IMPORTER.socket, "create_connection", return_value=channel
            ):
                with self.assertRaises(IMPORTER.ImportFailure):
                    IMPORTER.Adb("adb").usb_transport_id()

    def test_unknown_serial_on_selected_transport_is_rejected(self):
        adb = IMPORTER.Adb("fixture-adb")
        with mock.patch.object(adb, "run", side_effect=["", "unknown"]), mock.patch.object(
            adb, "usb_transport_id", return_value=42
        ):
            with self.assertRaises(IMPORTER.ImportFailure):
                adb.connect()

    def test_cancelled_run_never_spawns_child(self):
        cancelled = threading.Event()
        cancelled.set()
        with mock.patch.object(IMPORTER.subprocess, "Popen") as popen:
            with self.assertRaises(IMPORTER.ImportCancelled):
                IMPORTER.Adb("adb", cancel_event=cancelled).run("start-server")
        popen.assert_not_called()

    def test_subprocess_cancellation_reaps_only_active_child(self):
        cancelled = threading.Event()
        child = mock.Mock()
        child.poll.return_value = None
        def communicate(timeout=None):
            if timeout == 2:
                return b"", b""
            cancelled.set()
            raise subprocess.TimeoutExpired("adb", timeout)
        child.communicate.side_effect = communicate
        with mock.patch.object(IMPORTER.subprocess, "Popen", return_value=child) as popen:
            with self.assertRaises(IMPORTER.ImportCancelled):
                IMPORTER.Adb("adb", cancel_event=cancelled).pull("remote", "local")
        child.terminate.assert_called_once()
        child.kill.assert_not_called()
        self.assertEqual(popen.call_args.args[0][:5], ["adb", "-H", "127.0.0.1", "-P", "5037"])

    def test_only_debug_package_can_be_discovered_without_querying_missing_release(self):
        adb = IMPORTER.Adb("fixture-adb")
        with mock.patch.object(
            adb, "shell", return_value="package:io.rootlens.mentra.debug"
        ) as shell:
            self.assertEqual(adb.package(), "io.rootlens.mentra.debug")
        shell.assert_called_once_with("pm list packages io.rootlens.mentra")

    def test_package_selection_requires_an_exact_unique_match(self):
        adb = IMPORTER.Adb("fixture-adb")
        for listing in ("", "package:io.rootlens.mentra.debug.other", "\n".join(
            "package:" + package for package in IMPORTER.PACKAGES
        )):
            with self.subTest(listing=listing), mock.patch.object(adb, "shell", return_value=listing):
                with self.assertRaises(IMPORTER.ImportFailure):
                    adb.package()
        with mock.patch.object(adb, "shell", return_value="\n".join(
            "package:" + package for package in IMPORTER.PACKAGES
        )):
            self.assertEqual(adb.package("io.rootlens.mentra"), "io.rootlens.mentra")

    def test_malformed_remote_checksums_are_rejected(self):
        adb = IMPORTER.Adb("adb")
        for result in ("", "not-a-hash file", "0" * 64 + "  /unexpected/rgb.mp4"):
            with self.subTest(result=result), mock.patch.object(adb, "shell", return_value=result):
                with self.assertRaises(IMPORTER.ImportFailure):
                    adb.checksums("/recordings/rec-20260911T083000.000Z")


class ImportLockTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.staging = Path(temporary.name)

    @unittest.skipUnless(os.name == "posix", "POSIX filesystem lock check")
    def test_concurrent_import_is_rejected(self):
        with IMPORTER.import_lock(self.staging):
            with self.assertRaises(IMPORTER.ImportFailure):
                with IMPORTER.import_lock(self.staging):
                    self.fail("Second import acquired the same destination lock")
        with IMPORTER.import_lock(self.staging):
            pass

    @unittest.skipUnless(os.name == "posix", "symlink fixture requires POSIX")
    def test_symlink_lock_does_not_modify_its_target(self):
        target = self.staging / "other-file"
        target.write_bytes(b"preserve this file")
        (self.staging / "import.lock").symlink_to(target)
        with self.assertRaises(IMPORTER.ImportFailure):
            with IMPORTER.import_lock(self.staging):
                self.fail("Symlink lock was accepted")
        self.assertEqual(target.read_bytes(), b"preserve this file")


if __name__ == "__main__":
    unittest.main()
