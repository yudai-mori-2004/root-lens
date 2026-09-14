import json
from pathlib import Path
import tempfile
import threading
import unittest

from rootlens_import.approval import approve_recording, recording_manifest
from rootlens_import.core import FILES, ImportFailure
from unit_fixtures import unit_id


class Gateway:
    def __init__(self):
        self.created = None
        self.polls = 0

    def create_approval(self, identity, digest, files):
        self.created = (identity, digest, files)
        return {"status": "pending", "approvalId": "approval_test", "approvalUrl": "https://www.rootlens.io/approve/test"}

    def approval_status(self, approval_id):
        self.polls += 1
        return {"status": "complete", "approvalEventId": "apv_test"}


class ApprovalTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / unit_id()
        self.path.mkdir()
        (self.path / "rgb.mp4").write_bytes(b"video")
        (self.path / "frames.jsonl").write_text("{}\n")
        (self.path / "imu.jsonl").write_text("{}\n")
        (self.path / "metadata.json").write_text(json.dumps({
            "schema": "rootlens.mentra.raw.v1",
            "files": list(FILES),
            "unit_id": self.path.name,
            "created_at": "2026-09-14T00:00:00.000Z",
        }))

    def test_approval_binds_all_recording_bytes_before_upload(self):
        gateway = Gateway()
        opened = []
        event_id = approve_recording(self.path, gateway, open_browser=lambda url: opened.append(url) or True)
        self.assertEqual(event_id, "apv_test")
        self.assertEqual(opened, ["https://www.rootlens.io/approve/test"])
        recording, files, digest = recording_manifest(self.path)
        self.assertEqual(gateway.created, (recording.unit_id, digest, files))

    def test_changed_file_after_approval_is_rejected(self):
        gateway = Gateway()
        def browser(_url):
            (self.path / "imu.jsonl").write_text('{"changed":true}\n')
            return True
        with self.assertRaisesRegex(ImportFailure, "承認後に録画の内容が変わりました"):
            approve_recording(self.path, gateway, open_browser=browser)


if __name__ == "__main__":
    unittest.main()
