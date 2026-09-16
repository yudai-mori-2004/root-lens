"""Device-first synchronization and cleanup integration, without real USB or Drive."""

import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from rootlens_import import core, device_sync
from unit_fixtures import unit_id


class DeviceFixture:
    """Portable device boundary; records which remote files were actually hashed."""

    def __init__(self, source):
        self.source = source
        self.cancel_event = None
        self.hashed = []
        self.pulled = []
        self.complete_calls = 0
        self.becomes_incomplete = False

    def connect(self):
        return "USB_FIXTURE"

    def package(self, requested=None):
        return "io.rootlens.mentra.debug"

    def clip_names(self, root):
        return [self.source.name]

    def complete(self, remote):
        self.complete_calls += 1
        if self.becomes_incomplete and self.complete_calls > 1:
            return False
        names = {path.name for path in self.source.iterdir()}
        return (set(core.FILES).issubset(names) and "failure.json" not in names
                and not any(name.endswith(".partial") for name in names))

    def metadata(self, remote):
        return core.validate_metadata(json.loads((self.source / "metadata.json").read_text()))

    def sizes(self, remote):
        return {name: (self.source / name).stat().st_size for name in core.FILES}

    def checksums(self, remote, files=core.FILES):
        self.hashed.append(tuple(files))
        return {name: hashlib.sha256((self.source / name).read_bytes()).hexdigest() for name in files}

    def pull(self, remote, destination):
        name = Path(remote).name
        self.pulled.append(name)
        shutil.copyfile(self.source / name, destination)

    def write_metadata(self, remote, metadata):
        (self.source / "metadata.json").write_text(json.dumps(metadata))

    def run(self, *args):
        assert args == ("get-serialno",)
        return "USB_FIXTURE"


class DeviceSyncTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = Path(temporary.name).resolve()
        self.output = self.base / "recordings"
        self.name = "rec-20260911T083000.000Z"
        self.source = self.base / "device" / self.name
        self.source.mkdir(parents=True)
        (self.source / "rgb.mp4").write_bytes(b"complete video fixture")
        (self.source / "frames.jsonl").write_bytes(b'{"frame_index":0}\n')
        (self.source / "imu.jsonl").write_bytes(b'{"sensor":"gyroscope"}\n')
        self.unit_id = unit_id()
        (self.source / "metadata.json").write_text(json.dumps({
            "schema": "rootlens.mentra.raw.v1", "unit_id": self.unit_id,
            "site_id": "fixture", "files": list(core.FILES)}))
        self.adb = DeviceFixture(self.source)
        self.events = []
        self.reader = Mock(return_value={})
        self.pending = Mock(return_value=[])
        self.cleanup = Mock()
        for target, value in (("Adb", Mock(return_value=self.adb)), ("find_adb", Mock(return_value="fixture")),
                              ("discover_pending", self.pending), ("cleanup_recording", self.cleanup)):
            patcher = patch.object(device_sync, target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def sync(self):
        return device_sync.sync_recordings(self.output, drive_reader=self.reader, site_id="fixture",
                                           log=lambda _: None, on_clip=self.events.append)

    def test_device_metadata_precedes_targeted_drive_read(self):
        def read(targets):
            self.assertGreater(self.adb.complete_calls, 0)
            self.assertEqual(targets, {self.unit_id})
            return {}
        self.reader.side_effect = read
        result = self.sync()
        self.assertEqual(result.imported, 1)
        self.assertEqual(self.reader.call_count, 1)
        self.assertEqual(self.adb.hashed, [core.FILES])
        self.assertEqual(self.adb.pulled, list(core.FILES))
        self.assertIs(result.sources[self.unit_id].adb, self.adb)
        self.assertEqual(result.sources[self.unit_id].serial, "USB_FIXTURE")

    def test_saved_clip_goes_to_full_cleanup_without_copying(self):
        snapshot = object()
        self.reader.return_value = {self.unit_id: snapshot}
        def cleanup(adb, root, name, unit_id, reader, **kwargs):
            self.assertIs(adb, self.adb)
            self.assertEqual((name, unit_id), (self.name, self.unit_id))
            self.assertIs(reader(unit_id), snapshot)
        self.cleanup.side_effect = cleanup
        result = self.sync()
        self.assertEqual(result.cleaned, 1)
        self.assertEqual(result.sources, {})
        self.assertEqual(self.adb.pulled, [])
        self.assertEqual(self.events[-1].state, "drive_saved")
        self.assertEqual(self.reader.call_args.args[0], {self.unit_id})

    def test_empty_device_does_not_read_drive_or_local_history(self):
        self.adb.clip_names = lambda root: []
        self.reader.side_effect = AssertionError("No Drive query for empty device")
        result = self.sync()
        self.assertEqual(result.sources, {})
        self.assertEqual(self.events, [])
        self.reader.assert_not_called()

    def test_incomplete_recording_is_neither_looked_up_nor_deleted(self):
        (self.source / "failure.json").write_text("failed")
        result = self.sync()
        self.assertEqual(result.incomplete, 1)
        self.reader.assert_not_called()
        self.cleanup.assert_not_called()
        self.assertEqual(self.events[-1].state, "incomplete")

    def test_old_pc_copies_are_not_work_items(self):
        self.sync()
        self.events.clear()
        self.adb.clip_names = lambda root: []
        self.reader.reset_mock()
        result = self.sync()
        self.assertEqual(result.sources, {})
        self.assertEqual(self.events, [])
        self.reader.assert_called_once_with({self.unit_id})
        self.assertTrue(any(self.output.iterdir()))

    def test_drive_error_still_imports_without_deleting(self):
        self.reader.side_effect = RuntimeError("secret request headers")
        checked = []
        result = device_sync.sync_recordings(
            self.output, drive_reader=self.reader, site_id="fixture", log=lambda _: None,
            on_drive_checked=lambda recordings, error: checked.append((recordings, error)),
        )
        self.assertEqual(result.imported, 1)
        self.assertEqual(checked[0][0], {})
        self.assertIn("保存状況を確認できません", checked[0][1])
        self.assertNotIn("secret", checked[0][1])
        self.cleanup.assert_not_called()
        self.assertEqual(self.adb.pulled, list(core.FILES))

    def test_saved_clip_removes_matching_pc_copy_after_device_cleanup(self):
        self.sync()
        self.reader.reset_mock()
        files = {name: {"size": (self.source / name).stat().st_size,
                        "sha256": hashlib.sha256((self.source / name).read_bytes()).hexdigest()}
                 for name in core.FILES}
        self.reader.return_value = {self.unit_id: SimpleNamespace(unit_id=self.unit_id, files=files)}
        result = self.sync()
        self.assertEqual((result.cleaned, result.local_cleaned), (1, 1))
        self.assertFalse((self.output / self.unit_id).exists())

    def test_saved_copy_is_removed_after_device_clip_disappeared(self):
        self.sync()
        files = {name: {"size": (self.source / name).stat().st_size,
                        "sha256": hashlib.sha256((self.source / name).read_bytes()).hexdigest()}
                 for name in core.FILES}
        self.adb.clip_names = lambda root: []
        self.reader.return_value = {self.unit_id: SimpleNamespace(unit_id=self.unit_id, files=files)}
        result = self.sync()
        self.assertEqual(result.local_cleaned, 1)
        self.assertFalse((self.output / self.unit_id).exists())

    def test_partially_deleted_copy_is_finished_on_reconnect(self):
        self.sync()
        files = {name: {"size": (self.source / name).stat().st_size,
                        "sha256": hashlib.sha256((self.source / name).read_bytes()).hexdigest()}
                 for name in core.FILES}
        (self.output / self.unit_id / "rgb.mp4").unlink()
        self.adb.clip_names = lambda root: []
        self.reader.return_value = {self.unit_id: SimpleNamespace(unit_id=self.unit_id, files=files)}
        result = self.sync()
        self.assertEqual(result.local_cleaned, 1)
        self.assertFalse((self.output / self.unit_id).exists())

    def test_mismatched_saved_copy_is_retained(self):
        self.sync()
        self.adb.clip_names = lambda root: []
        self.reader.return_value = {self.unit_id: SimpleNamespace(
            unit_id=self.unit_id,
            files={name: {"size": 1, "sha256": "0" * 64} for name in core.FILES},
        )}
        result = self.sync()
        self.assertEqual(result.local_cleaned, 0)
        self.assertEqual(result.local_cleanup_pending, 1)
        self.assertTrue((self.output / self.unit_id).exists())

    def test_pending_cleanup_uses_unit_id_even_if_metadata_was_removed(self):
        self.adb.clip_names = lambda root: []
        item = SimpleNamespace(name="pending-device-directory", original_name=self.name,
                               unit_id=self.unit_id)
        self.pending.return_value = [item]
        self.reader.return_value = {self.unit_id: object()}
        result = self.sync()
        self.assertEqual(result.cleaned, 1)
        self.assertEqual(self.reader.call_args.args[0], {self.unit_id})
        self.assertEqual(self.cleanup.call_args.args[2:4], (item.name, self.unit_id))

    def test_offline_pending_cleanup_is_deferred_without_rechecking_drive(self):
        self.adb.clip_names = lambda root: []
        self.pending.return_value = [SimpleNamespace(
            name="pending-device-directory", original_name=self.name, unit_id=self.unit_id,
        )]
        self.reader.side_effect = RuntimeError("offline")
        result = self.sync()
        self.assertEqual(result.cleanup_pending, 1)
        self.assertEqual(self.reader.call_count, 1)
        self.cleanup.assert_not_called()

    def test_cleanup_failure_stays_visible_without_retransmitting(self):
        self.reader.return_value = {self.unit_id: object()}
        self.cleanup.side_effect = core.ImportFailure("USB lost")
        result = self.sync()
        self.assertEqual((result.cleanup_pending, result.cleaned, result.failed), (1, 0, 0))
        self.assertEqual(self.events[-1].state, "cleanup_pending")
        self.assertEqual(result.sources, {})
        self.assertEqual(self.adb.pulled, [])

    def test_cleanup_cancel_propagates_without_claiming_all_originals_remain(self):
        self.reader.return_value = {self.unit_id: object()}
        self.cleanup.side_effect = core.ImportCancelled("cancelled")
        with self.assertRaises(core.ImportCancelled):
            self.sync()

    def test_changed_usb_serial_blocks_connect_cleanup(self):
        self.reader.return_value = {self.unit_id: object()}
        self.adb.run = lambda *args: "REPLACEMENT_DEVICE"
        result = self.sync()
        self.assertEqual(result.cleanup_pending, 1)
        self.cleanup.assert_not_called()

    def test_upload_cleanup_keeps_original_transport(self):
        result = self.sync()
        source = result.sources[self.unit_id]
        reader = Mock(return_value={self.unit_id: object()})
        device_sync.cleanup_uploaded_recording(source, drive_reader=reader)
        self.assertIs(self.cleanup.call_args.args[0], self.adb)
        self.assertEqual(self.cleanup.call_args.args[2:4], (self.name, self.unit_id))

    def test_upload_cleanup_rejects_replacement_serial(self):
        source = self.sync().sources[self.unit_id]
        self.adb.run = lambda *args: "REPLACEMENT_DEVICE"
        with self.assertRaises(core.ImportFailure):
            device_sync.cleanup_uploaded_recording(source, drive_reader=Mock())
        self.cleanup.assert_not_called()


if __name__ == '__main__':
    unittest.main()
