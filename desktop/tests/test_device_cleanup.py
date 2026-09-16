"""Exercise cleanup commands against disposable files, including lost USB replies."""

import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
from types import SimpleNamespace
import unittest

from rootlens_import.core import (FILES, ImportCancelled, ImportFailure,
                                  unit_files_sha256, validate_metadata)
from rootlens_import.device_cleanup import (
    AUXILIARY_FILES, PENDING_NAME, cleanup_recording, discover_pending,
    discard_recording, discover_pending_discards, discard_problem_recording,
    discover_pending_problem_discards, _manifest,
)
from unit_fixtures import unit_id


ROOT = "/sdcard/Android/data/io.rootlens.mentra.debug/files/recordings"
NAME = "rec-20260911T123456.789Z"
FIXTURE_AUXILIARY = ("camera_frames.raw.jsonl", "sync_report.json")


class LocalAdb:
    """Run real POSIX guards/unlinks, replacing Android-only utilities in a fixture."""

    def __init__(self, temporary):
        self.base = Path(temporary)
        self.selector = ["-t", "23"]
        self.cancel_event = threading.Event()
        self.commands = []
        self.hash_calls = []
        self.before_shell = None
        self.after_shell = None
        self.after_hash = None
        self.utilities = self.base / "bin"
        self.utilities.mkdir(exist_ok=True)
        script = (
            "#!" + sys.executable + "\n"
            "import os, pathlib, sys\n"
            "name = pathlib.Path(sys.argv[0]).name\n"
            "if name == 'stat':\n"
            "    assert sys.argv[1:4] == ['-c', '%s|%d|%i|%y|%z', '--']\n"
            "    s = os.stat(sys.argv[4], follow_symlinks=False)\n"
            "    print(f'{s.st_size}|{s.st_dev}|{s.st_ino}|{s.st_mtime_ns}|{s.st_ctime_ns}')\n"
            "elif name == 'mv':\n"
            "    assert sys.argv[1:4] == ['-n', '-T', '--']\n"
            "    source, target = sys.argv[4:]\n"
            "    if not os.path.lexists(target): os.rename(source, target)\n"
            "elif name == 'sync':\n"
            "    pass\n"
            "else: raise AssertionError(name)\n"
        )
        for name in ("stat", "mv", "sync"):
            utility = self.utilities / name
            utility.write_text(script)
            utility.chmod(0o700)

    def local(self, remote):
        assert remote.startswith("/sdcard/")
        return self.base / remote.lstrip("/")

    def shell(self, command, timeout=60):
        if self.cancel_event.is_set():
            raise ImportCancelled("cancel")
        self.commands.append(command)
        if self.before_shell is not None:
            self.before_shell(command)
        # All remote paths map under this test's TemporaryDirectory.
        translated = command.replace("/sdcard/", str(self.base) + "/sdcard/")
        environment = dict(os.environ, PATH=str(self.utilities) + os.pathsep + os.environ.get("PATH", ""))
        result = subprocess.run(["/bin/sh", "-c", translated], env=environment,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
        if result.returncode:
            raise ImportFailure("fixture shell rejected command")
        if self.after_shell is not None:
            self.after_shell(command)
        return result.stdout.decode().strip()

    def metadata(self, remote):
        return validate_metadata(json.loads((self.local(remote) / "metadata.json").read_text()))

    def checksums(self, remote, files=FILES):
        self.hash_calls.append(tuple(files))
        result = {name: hashlib.sha256((self.local(remote) / name).read_bytes()).hexdigest() for name in files}
        if self.after_hash is not None:
            self.after_hash()
        return result


def descriptor_for(path, identity):
    files = {name: dict(id="file-" + str(index), size=(path / name).stat().st_size,
                        sha256=hashlib.sha256((path / name).read_bytes()).hexdigest())
             for index, name in enumerate(FILES)}
    source_files = {name: {"size": item["size"], "sha256": item["sha256"]} for name, item in files.items()}
    from rootlens_import.core import unit_files_sha256
    return SimpleNamespace(unit_id=identity, folder_id="drive-folder", name=identity, files=files,
                           files_sha256=unit_files_sha256(identity, source_files))


@unittest.skipIf(os.name == "nt", "Uses a POSIX shell to execute Android command guards on fixture files")
class DeviceCleanupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="rootlens-cleanup-")
        self.addCleanup(self.temporary.cleanup)
        self.adb = LocalAdb(self.temporary.name)
        self.root = self.adb.local(ROOT)
        self.path = self.root / NAME
        self.path.mkdir(parents=True)
        video = b"synthetic video bytes, never a real recording"
        self.unit_id = unit_id()
        metadata = dict(schema="rootlens.mentra.raw.v1", files=list(FILES), unit_id=self.unit_id)
        payloads = dict(zip(FILES, (video, b'{"frame":1}\n', b'{"imu":1}\n', json.dumps(metadata).encode())))
        for name, payload in payloads.items():
            (self.path / name).write_bytes(payload)
        for name in FIXTURE_AUXILIARY:
            (self.path / name).write_text("diagnostic\n")
        self.descriptor = descriptor_for(self.path, self.unit_id)
        self.reads = []
        self.progress = []
        self.neighbor = self.root / "rec-20260911T000000.000Z"
        self.neighbor.mkdir()
        (self.neighbor / "keep.txt").write_text("not this recording")

    def read_drive(self, digest):
        self.reads.append(digest)
        self.assertEqual(digest, self.unit_id)
        return copy.deepcopy(self.descriptor)

    def clean(self, name=NAME, reader=None, adb=None):
        return cleanup_recording(adb or self.adb, ROOT, name, self.unit_id,
                                 reader or self.read_drive, log=lambda _: None,
                                 on_progress=self.progress.append)

    def pending(self):
        found = discover_pending(self.adb, ROOT)
        self.assertEqual(len(found), 1)
        return found[0]

    def assert_no_mutation(self):
        self.assertTrue(self.path.is_dir())
        self.assertFalse(any(" && mv " in command or " && rm -- " in command or " && rmdir -- " in command
                             for command in self.adb.commands))

    def test_discard_removes_only_the_confirmed_recording(self):
        expected = {name: self.descriptor.files[name] for name in FILES}
        discard_recording(self.adb, ROOT, NAME, self.unit_id, expected)
        self.assertFalse(self.path.exists())
        self.assertTrue((self.neighbor / "keep.txt").is_file())
        self.assertEqual(discover_pending_discards(self.adb, ROOT), [])

    def test_discard_rejects_a_mismatched_copy_without_mutating_device(self):
        expected = {name: dict(self.descriptor.files[name]) for name in FILES}
        expected["rgb.mp4"]["sha256"] = "0" * 64
        with self.assertRaises(ImportFailure):
            discard_recording(self.adb, ROOT, NAME, self.unit_id, expected)
        self.assert_no_mutation()

    def test_interrupted_discard_resumes_from_the_durable_marker(self):
        expected = {name: self.descriptor.files[name] for name in FILES}
        interrupted = False

        def disconnect(command):
            nonlocal interrupted
            if not interrupted and " && rm -- " in command:
                interrupted = True
                raise ImportFailure("lost USB reply")

        self.adb.after_shell = disconnect
        with self.assertRaises(ImportFailure):
            discard_recording(self.adb, ROOT, NAME, self.unit_id, expected)
        pending = discover_pending_discards(self.adb, ROOT)
        self.assertEqual(len(pending), 1)
        self.adb.after_shell = None
        discard_recording(self.adb, ROOT, pending[0][0], self.unit_id)
        self.assertEqual(discover_pending_discards(self.adb, ROOT), [])
        self.assertTrue((self.neighbor / "keep.txt").is_file())

    def test_incomplete_recording_can_be_discarded_without_a_valid_unit_id(self):
        (self.path / "metadata.json").unlink()
        (self.path / "rgb.mp4").rename(self.path / "rgb.mp4.partial")
        (self.path / "failure.json").write_text('{"reason":"capture failed"}')
        discard_problem_recording(self.adb, ROOT, NAME)
        self.assertFalse(self.path.exists())
        self.assertTrue((self.neighbor / "keep.txt").exists())

    def test_problem_discard_resumes_after_usb_interruption(self):
        (self.path / "metadata.json").unlink()
        (self.path / "metadata.json.partial").write_text("unfinished")

        def disconnect(command):
            if " && rm -- " in command:
                raise ImportFailure("lost USB")

        self.adb.after_shell = disconnect
        with self.assertRaises(ImportFailure):
            discard_problem_recording(self.adb, ROOT, NAME)
        pending = discover_pending_problem_discards(self.adb, ROOT)
        self.assertEqual(len(pending), 1)
        self.assertEqual(discover_pending_discards(self.adb, ROOT), [])
        self.adb.after_shell = None
        discard_problem_recording(self.adb, ROOT, pending[0][0])
        self.assertEqual(discover_pending_problem_discards(self.adb, ROOT), [])
        self.assertTrue((self.neighbor / "keep.txt").exists())

    def test_problem_discard_rejects_unknown_file_and_link(self):
        unknown = self.path / "other.txt"
        unknown.write_text("keep")
        with self.assertRaises(ImportFailure):
            discard_problem_recording(self.adb, ROOT, NAME)
        unknown.unlink()
        target = self.path / "external-link"
        target.symlink_to(self.neighbor)
        with self.assertRaises(ImportFailure):
            discard_problem_recording(self.adb, ROOT, NAME)
        self.assertTrue((self.path / "rgb.mp4").exists())

    def test_complete_recording_retires_all_seven_only_after_fresh_drive_and_sync(self):
        result = self.clean()
        self.assertEqual((result.name, result.unit_id), (NAME, self.unit_id))
        self.assertFalse(self.path.exists())
        self.assertEqual(discover_pending(self.adb, ROOT), [])
        self.assertEqual((self.neighbor / "keep.txt").read_text(), "not this recording")
        self.assertEqual(self.adb.hash_calls, [FILES])
        self.assertEqual(len(self.reads), 3)
        self.assertEqual([item.state for item in self.progress], ["verifying", "deleting", "deleted"])
        commands = self.adb.commands
        rename = next(index for index, value in enumerate(commands) if " && mv " in value)
        sync = next(index for index, value in enumerate(commands) if value.endswith(" && sync"))
        unlinks = [index for index, value in enumerate(commands) if " && rm -- " in value]
        self.assertEqual(len(unlinks), 6)
        self.assertLess(rename, sync)
        self.assertLess(sync, min(unlinks))
        self.assertFalse(any("rm -" in item for item in commands if "rm -- " not in item))

    def test_plain_four_file_recording_is_supported(self):
        for name in FIXTURE_AUXILIARY:
            (self.path / name).unlink()
        self.clean()
        self.assertFalse(self.path.exists())

    def test_legacy_content_hash_is_removed_only_after_drive_files_are_verified(self):
        (self.path / "content_hash.txt").write_text("old device digest\n")
        self.clean()
        self.assertFalse(self.path.exists())
        self.assertGreaterEqual(len(self.reads), 2)

    def test_finalized_camera_diagnostics_and_scratch_indexes_can_be_retired_and_resumed(self):
        extras = set(AUXILIARY_FILES) - set(FIXTURE_AUXILIARY)
        self.assertEqual(extras, {"content_hash.txt", "camera_capture_failures.txt", "camera_index.bin", "video_index.bin",
                                  "accelerometer_index.bin", "gyroscope_index.bin"})
        for interrupted in (False, True):
            with self.subTest(interrupted=interrupted):
                if interrupted:
                    self.setUp()
                for name in extras:
                    (self.path / name).write_text("1\n" if name.endswith(".txt") else "scratch")
                if interrupted:
                    def disconnect(command):
                        if " && rm -- " in command and command.endswith("/gyroscope_index.bin"):
                            raise ImportFailure("lost USB reply")
                    self.adb.after_shell = disconnect
                    with self.assertRaises(ImportFailure):
                        self.clean()
                    other_pc = LocalAdb(self.temporary.name)
                    pending = discover_pending(other_pc, ROOT)[0]
                    self.clean(pending.name, adb=other_pc)
                else:
                    self.clean()
                self.assertFalse(self.path.exists())
                self.assertEqual(self.adb.hash_calls, [FILES])
                self.assertEqual(discover_pending(LocalAdb(self.temporary.name), ROOT), [])

    def test_normal_missing_payload_is_never_retired(self):
        (self.path / "imu.jsonl").unlink()
        with self.assertRaises(ImportFailure):
            self.clean()
        self.assert_no_mutation()

    def test_unknown_partial_failure_or_index_file_stops_cleanup(self):
        for name in ("unknown.txt", "rgb.mp4.partial", "failure.json", "frames.index", ".hidden"):
            with self.subTest(name=name):
                path = self.path / name
                path.write_text("preserve")
                with self.assertRaises(ImportFailure):
                    self.clean()
                self.assert_no_mutation()
                self.assertEqual(path.read_text(), "preserve")
                path.unlink()

    def test_symlink_directory_or_payload_is_rejected_without_touching_target(self):
        target = Path(self.temporary.name) / "outside"
        target.write_bytes(b"keep")
        for name in ("imu.jsonl", "sync_report.json"):
            with self.subTest(name=name):
                path = self.path / name
                original = path.read_bytes()
                path.unlink()
                path.symlink_to(target)
                with self.assertRaises(ImportFailure):
                    self.clean()
                self.assertEqual(target.read_bytes(), b"keep")
                self.assert_no_mutation()
                path.unlink()
                path.write_bytes(original)
        held = self.path.with_name("held")
        self.path.rename(held)
        self.path.symlink_to(held, target_is_directory=True)
        with self.assertRaises(ImportFailure):
            self.clean()
        self.assertTrue((held / "rgb.mp4").exists())

    def test_recordings_parent_symlink_is_rejected(self):
        held = self.root.with_name("held-recordings")
        self.root.rename(held)
        self.root.symlink_to(held, target_is_directory=True)
        with self.assertRaises(ImportFailure):
            self.clean()
        self.assertTrue((held / NAME / "rgb.mp4").exists())

    def test_wrong_payload_sha_or_hash_marker_is_rejected(self):
        original = (self.path / "imu.jsonl").read_bytes()
        (self.path / "imu.jsonl").write_bytes(b"x" * len(original))
        with self.assertRaises(ImportFailure):
            self.clean()
        self.assert_no_mutation()
        (self.path / "imu.jsonl").write_bytes(original)
        (self.path / "unexpected.txt").write_text("not part of the recording contract")
        with self.assertRaises(ImportFailure):
            self.clean()
        self.assert_no_mutation()

    def test_mutation_during_hashing_stops(self):
        self.adb.after_hash = lambda: (self.path / "unknown.txt").write_text("added during hashing")
        with self.assertRaises(ImportFailure):
            self.clean()
        self.assert_no_mutation()

    def test_unknown_file_added_after_rename_stops_before_unlink(self):
        def added(command):
            if command.endswith(" && sync"):
                path = next(path for path in self.root.iterdir() if PENDING_NAME.fullmatch(path.name))
                (path / "keep.txt").write_text("appeared after verification")
        self.adb.after_shell = added
        with self.assertRaises(ImportFailure):
            self.clean()
        self.adb.after_shell = None
        path = self.root / self.pending().name
        self.assertEqual(len(list(path.iterdir())), 7)
        self.assertFalse(any(" && rm -- " in command for command in self.adb.commands))

    def test_cancel_before_verification_performs_no_io(self):
        self.adb.cancel_event.set()
        with self.assertRaises(ImportCancelled):
            self.clean()
        self.assertEqual(self.adb.commands, [])
        self.assertEqual(self.reads, [])
        self.assertEqual(self.progress[-1].state, "cancelled")

    def test_current_drive_change_before_rename_preserves_normal_directory(self):
        def changed(digest):
            result = self.read_drive(digest)
            if len(self.reads) == 2:
                result.files["imu.jsonl"]["id"] = "replacement-file"
            return result
        with self.assertRaises(ImportFailure):
            self.clean(reader=changed)
        self.assert_no_mutation()

    def test_current_drive_change_after_rename_preserves_full_pending_directory(self):
        def changed(digest):
            result = self.read_drive(digest)
            if len(self.reads) == 3:
                result.folder_id = "moved-folder"
            return result
        with self.assertRaises(ImportFailure):
            self.clean(reader=changed)
        pending = self.pending()
        self.assertEqual(set((self.root / pending.name).iterdir()),
                         {self.root / pending.name / name for name in (*FILES, *FIXTURE_AUXILIARY)})
        self.assertFalse(any(" && rm -- " in command for command in self.adb.commands))

    def test_sync_failure_never_starts_unlink(self):
        def fail(command):
            if command.endswith(" && sync"):
                raise ImportFailure("sync failed")
        self.adb.before_shell = fail
        with self.assertRaises(ImportFailure):
            self.clean()
        self.adb.before_shell = None
        pending = self.pending()
        self.assertEqual(len(list((self.root / pending.name).iterdir())), 6)
        self.assertFalse(any(" && rm -- " in command for command in self.adb.commands))
        self.clean(pending.name, adb=LocalAdb(self.temporary.name))

    def test_lost_usb_reply_after_each_mutation_resumes_without_pc_history(self):
        # Rename, each of six unlinks, and rmdir can succeed before USB disappears.
        for cut in range(8):
            with self.subTest(cut=cut):
                if cut:
                    self.setUp()
                count = 0
                def disconnect(command):
                    nonlocal count
                    if any(token in command for token in (" && mv ", " && rm -- ", " && rmdir -- ")):
                        if count == cut:
                            raise ImportFailure("lost USB reply")
                        count += 1
                self.adb.after_shell = disconnect
                with self.assertRaises(ImportFailure):
                    self.clean()
                other_pc = LocalAdb(self.temporary.name)
                found = discover_pending(other_pc, ROOT)
                if cut < 7:
                    self.assertEqual(len(found), 1)
                    self.clean(found[0].name, adb=other_pc)
                else:
                    self.assertEqual(found, [])
                self.assertFalse(self.path.exists())
                self.assertEqual(discover_pending(other_pc, ROOT), [])
                self.assertEqual((self.neighbor / "keep.txt").read_text(), "not this recording")

    def test_deleted_payload_replacement_on_drive_blocks_pending_resume(self):
        def disconnect(command):
            if " && rm -- " in command and command.endswith("/imu.jsonl"):
                raise ImportFailure("lost USB reply")
        self.adb.after_shell = disconnect
        with self.assertRaises(ImportFailure):
            self.clean()
        self.adb.after_shell = None
        pending = self.pending()
        path = self.root / pending.name
        remaining = {item.name: item.read_bytes() for item in path.iterdir()}
        self.assertNotIn("imu.jsonl", remaining)
        self.descriptor.files["imu.jsonl"]["id"] = "new-imu-object"
        with self.assertRaises(ImportFailure):
            self.clean(pending.name, adb=LocalAdb(self.temporary.name))
        self.assertEqual({item.name: item.read_bytes() for item in path.iterdir()}, remaining)

    def test_pending_remaining_file_must_still_match_drive(self):
        def disconnect(command):
            if " && mv " in command:
                raise ImportFailure("lost USB reply")
        self.adb.after_shell = disconnect
        with self.assertRaises(ImportFailure):
            self.clean()
        self.adb.after_shell = None
        pending = self.pending()
        (self.root / pending.name / "imu.jsonl").write_bytes(b"changed")
        with self.assertRaises(ImportFailure):
            self.clean(pending.name)
        self.assertTrue((self.root / pending.name / "rgb.mp4").exists())

    def test_cancel_after_rename_or_some_unlinks_has_no_success_and_can_resume(self):
        for token in (" && mv ", " && rm -- "):
            with self.subTest(token=token):
                if token == " && rm -- ":
                    self.setUp()
                self.adb.after_shell = lambda command: self.adb.cancel_event.set() if token in command else None
                with self.assertRaisesRegex(ImportCancelled, "次の接続"):
                    self.clean()
                self.assertEqual(self.progress[-1].state, "cancelled")
                self.assertNotIn("deleted", [item.state for item in self.progress])
                other_pc = LocalAdb(self.temporary.name)
                pending = discover_pending(other_pc, ROOT)[0]
                self.clean(pending.name, adb=other_pc)
                self.assertEqual(discover_pending(other_pc, ROOT), [])

    def test_existing_pending_target_is_never_overwritten_or_nested(self):
        digest = _manifest(self.read_drive, self.unit_id, NAME)[1]
        target = self.root / f".rootlens-cleanup-{NAME}-{self.unit_id}-{digest}"
        target.mkdir()
        (target / "keep.txt").write_text("keep")
        with self.assertRaises(ImportFailure):
            self.clean()
        self.assertTrue((self.path / "rgb.mp4").exists())
        self.assertEqual([path.name for path in target.iterdir()], ["keep.txt"])

    def test_bad_pending_name_or_link_fails_discovery(self):
        bad = self.root / ".rootlens-cleanup-unrecognized"
        bad.mkdir()
        with self.assertRaises(ImportFailure):
            discover_pending(self.adb, ROOT)
        bad.rmdir()
        digest = _manifest(self.read_drive, self.unit_id, NAME)[1]
        target = self.root / f".rootlens-cleanup-{NAME}-{self.unit_id}-{digest}"
        target.symlink_to(self.path, target_is_directory=True)
        with self.assertRaises(ImportFailure):
            discover_pending(self.adb, ROOT)

    def test_missing_recordings_directory_is_empty_but_existing_non_directory_is_rejected(self):
        held = self.root.with_name("held-recordings")
        self.root.rename(held)
        self.assertEqual(discover_pending(self.adb, ROOT), [])
        self.root.write_text("not a directory")
        with self.assertRaises(ImportFailure):
            discover_pending(self.adb, ROOT)
        self.root.unlink()
        self.root.symlink_to(self.root.with_name("missing"), target_is_directory=True)
        with self.assertRaises(ImportFailure):
            discover_pending(self.adb, ROOT)

    def test_unpinned_transport_and_invalid_paths_never_run_shell(self):
        for selector in (["-d"], ["-s", "serial"], ["-t", "0"], ["-t", "1; rm"]):
            self.adb.selector = selector
            with self.assertRaises(ImportFailure):
                self.clean()
            self.assertEqual(self.adb.commands, [])
        self.adb.selector = ["-t", "23"]
        for root, name in ((ROOT + "/..", NAME), ("/sdcard/recordings", NAME), (ROOT, "../" + NAME)):
            with self.assertRaises(ImportFailure):
                cleanup_recording(self.adb, root, name, self.unit_id, self.read_drive)
            self.assertEqual(self.adb.commands, [])


class CleanupManifestTests(unittest.TestCase):
    def setUp(self):
        self.digest = unit_id()
        files = {name: dict(id="id" + str(index), size=123, sha256="a" * 64)
                 for index, name in enumerate(FILES)}
        source_files = {name: {"size": item["size"], "sha256": item["sha256"]}
                        for name, item in files.items()}
        self.recording = SimpleNamespace(unit_id=self.digest, name=self.digest,
                                         folder_id="folder", files=files,
                                         files_sha256=unit_files_sha256(self.digest, source_files))

    def manifest(self):
        return _manifest(lambda _: self.recording, self.digest, NAME)[1]

    def test_digest_is_stable_and_covers_every_file_identity_and_destination(self):
        baseline = self.manifest()
        self.recording.files = dict(reversed(list(self.recording.files.items())))
        self.assertEqual(self.manifest(), baseline)
        for filename in FILES:
            for field, value in (("id", "replacement"), ("size", 124), ("sha256", "b" * 64)):
                with self.subTest(file=filename, field=field):
                    old = self.recording.files[filename][field]
                    self.recording.files[filename][field] = value
                    source_files = {name: {"size": item["size"], "sha256": item["sha256"]}
                                    for name, item in self.recording.files.items()}
                    self.recording.files_sha256 = unit_files_sha256(self.digest, source_files)
                    self.assertNotEqual(self.manifest(), baseline)
                    self.recording.files[filename][field] = old
                    source_files = {name: {"size": item["size"], "sha256": item["sha256"]}
                                    for name, item in self.recording.files.items()}
                    self.recording.files_sha256 = unit_files_sha256(self.digest, source_files)
        self.recording.folder_id = "another-folder"
        self.assertNotEqual(self.manifest(), baseline)
        pending = f".rootlens-cleanup-{NAME}-{self.digest}-{baseline}"
        self.assertLessEqual(len(pending.encode()), 255)
        self.assertIsNotNone(PENDING_NAME.fullmatch(pending))

    def test_invalid_drive_manifests_are_rejected(self):
        original = copy.deepcopy(self.recording)
        mutations = [lambda: setattr(self.recording, "folder_id", "../folder"),
                     lambda: setattr(self.recording, "name", NAME),
                     lambda: setattr(self.recording, "unit_id", "b" * 64),
                     lambda: self.recording.files.pop("imu.jsonl"),
                     lambda: self.recording.files.update(extra={}),
                     lambda: self.recording.files["imu.jsonl"].update(size=True),
                     lambda: self.recording.files["imu.jsonl"].update(size=0),
                     lambda: self.recording.files["imu.jsonl"].update(sha256="b"),
                     lambda: self.recording.files["imu.jsonl"].update(id="id0"),
                     lambda: self.recording.files["rgb.mp4"].update(sha256="b" * 64)]
        for mutate in mutations:
            self.recording = copy.deepcopy(original)
            mutate()
            with self.assertRaises(ImportFailure):
                self.manifest()
        self.recording = None
        with self.assertRaises(ImportFailure):
            self.manifest()


if __name__ == "__main__":
    unittest.main()
