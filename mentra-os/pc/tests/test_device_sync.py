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
        self.digest = core.checksum(self.source / "rgb.mp4")
        (self.source / "metadata.json").write_text(json.dumps({
            "schema": "rootlens.mentra.raw.v1", "content_hash": self.digest, "files": list(core.FILES)}))
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
        return device_sync.sync_recordings(self.output, drive_reader=self.reader,
                                           log=lambda _: None, on_clip=self.events.append)

    def test_device_metadata_precedes_targeted_drive_read(self):
        def read(targets):
            self.assertGreater(self.adb.complete_calls, 0)
            self.assertEqual(targets, {self.digest})
            return {}
        self.reader.side_effect = read
        result = self.sync()
        self.assertEqual(result.imported, 1)
        self.assertEqual(self.reader.call_count, 1)
        self.assertEqual(self.adb.hashed, [core.FILES])
        self.assertEqual(self.adb.pulled, list(core.FILES))
        self.assertIs(result.sources[self.name].adb, self.adb)
        self.assertEqual(result.sources[self.name].serial, "USB_FIXTURE")

    def test_saved_clip_goes_to_full_cleanup_without_copying(self):
        snapshot = object()
        self.reader.return_value = {self.digest: snapshot}
        def cleanup(adb, root, name, digest, reader, **kwargs):
            self.assertIs(adb, self.adb)
            self.assertEqual((name, digest), (self.name, self.digest))
            self.assertIs(reader(digest), snapshot)
        self.cleanup.side_effect = cleanup
        result = self.sync()
        self.assertEqual(result.cleaned, 1)
        self.assertEqual(result.sources, {})
        self.assertEqual(self.adb.pulled, [])
        self.assertEqual(self.events[-1].state, "drive_saved")
        self.assertEqual(self.reader.call_args.args[0], {self.digest})

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
        self.reader.assert_not_called()
        self.assertTrue(any(self.output.iterdir()))

    def test_drive_error_does_not_copy_or_delete(self):
        self.reader.side_effect = RuntimeError("secret request headers")
        with self.assertRaises(core.ImportFailure) as error:
            self.sync()
        self.assertNotIn("secret", str(error.exception))
        self.cleanup.assert_not_called()
        self.assertEqual(self.adb.pulled, [])

    def test_pending_cleanup_uses_device_hash_even_if_metadata_was_removed(self):
        self.adb.clip_names = lambda root: []
        item = SimpleNamespace(name="pending-device-directory", original_name=self.name,
                               content_hash=self.digest)
        self.pending.return_value = [item]
        self.reader.return_value = {self.digest: object()}
        result = self.sync()
        self.assertEqual(result.cleaned, 1)
        self.assertEqual(self.reader.call_args.args[0], {self.digest})
        self.assertEqual(self.cleanup.call_args.args[2:4], (item.name, self.digest))

    def test_cleanup_failure_stays_visible_without_retransmitting(self):
        self.reader.return_value = {self.digest: object()}
        self.cleanup.side_effect = core.ImportFailure("USB lost")
        result = self.sync()
        self.assertEqual((result.cleanup_pending, result.cleaned, result.failed), (1, 0, 0))
        self.assertEqual(self.events[-1].state, "cleanup_pending")
        self.assertEqual(result.sources, {})
        self.assertEqual(self.adb.pulled, [])

    def test_cleanup_cancel_propagates_without_claiming_all_originals_remain(self):
        self.reader.return_value = {self.digest: object()}
        self.cleanup.side_effect = core.ImportCancelled("cancelled")
        with self.assertRaises(core.ImportCancelled):
            self.sync()

    def test_changed_usb_serial_blocks_connect_cleanup(self):
        self.reader.return_value = {self.digest: object()}
        self.adb.run = lambda *args: "REPLACEMENT_DEVICE"
        result = self.sync()
        self.assertEqual(result.cleanup_pending, 1)
        self.cleanup.assert_not_called()

    def test_upload_cleanup_keeps_original_transport(self):
        result = self.sync()
        source = result.sources[self.name]
        reader = Mock(return_value={self.digest: object()})
        device_sync.cleanup_uploaded_recording(source, drive_reader=reader)
        self.assertIs(self.cleanup.call_args.args[0], self.adb)
        self.assertEqual(self.cleanup.call_args.args[2:4], (self.name, self.digest))

    def test_upload_cleanup_rejects_replacement_serial(self):
        source = self.sync().sources[self.name]
        self.adb.run = lambda *args: "REPLACEMENT_DEVICE"
        with self.assertRaises(core.ImportFailure):
            device_sync.cleanup_uploaded_recording(source, drive_reader=Mock())
        self.cleanup.assert_not_called()


if __name__ == '__main__':
    unittest.main()
