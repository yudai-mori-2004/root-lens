"""A finished attempt must rediscover current Drive objects before another upload."""

import copy
import json
import threading
import unittest

from rootlens_import.core import ImportCancelled, ImportFailure
import test_drive as fixtures


class UploadJournalRecoveryTests(unittest.TestCase):
    setUp = fixtures.DriveUploadTests.setUp
    uploader = fixtures.DriveUploadTests.uploader
    state_file = fixtures.DriveUploadTests.state_file

    def test_completed_attempt_rediscovers_after_folder_is_trashed_or_moved(self):
        for mutation in ("trashed", "moved"):
            with self.subTest(mutation=mutation):
                # Each subcase uses an isolated Drive, journal, and set of originals.
                if mutation == "moved":
                    self.setUp()
                first = self.uploader().upload_recording(self.path)
                old = self.http.files[first.folder_id]
                if mutation == "trashed":
                    old["trashed"] = True
                else:
                    old["parents"] = ["OTHERFOLDER00000"]
                before = copy.deepcopy(self.http.files)
                result = self.uploader().upload_recording(self.path)
                self.assertNotEqual(result.folder_id, first.folder_id)
                for file_id, value in before.items():
                    self.assertEqual(self.http.files[file_id], value)
                self.assertTrue(json.loads(self.state_file().read_text())["completed"])
                self.assertEqual((self.path / "rgb.mp4").read_bytes(), self.video)

    def test_completed_attempt_replaces_only_missing_file_after_trash_or_move(self):
        for mutation in ("trashed", "moved"):
            with self.subTest(mutation=mutation):
                if mutation == "moved":
                    self.setUp()
                first = self.uploader().upload_recording(self.path)
                state = json.loads(self.state_file().read_text())
                missing_id = state["files"]["imu.jsonl"]["id"]
                if mutation == "trashed":
                    self.http.files[missing_id]["trashed"] = True
                else:
                    self.http.files[missing_id]["parents"] = ["OTHERFOLDER00000"]
                before = copy.deepcopy(self.http.files)
                writes_before = len(self.http.writes)
                result = self.uploader().upload_recording(self.path)
                self.assertEqual(result.folder_id, first.folder_id)
                self.assertEqual([item[0] for item in self.http.writes[writes_before:]], ["imu.jsonl"])
                for file_id, value in before.items():
                    self.assertEqual(self.http.files[file_id], value)
                next_state = json.loads(self.state_file().read_text())
                self.assertTrue(next_state["completed"])
                self.assertNotEqual(next_state["files"]["imu.jsonl"]["id"], missing_id)

    def test_partial_attempt_keeps_its_resumable_session_and_offset(self):
        cancel = threading.Event()
        self.http.on_chunk = lambda *_: cancel.set()
        with self.assertRaises(ImportCancelled):
            self.uploader().upload_recording(self.path, cancel_event=cancel)
        partial = json.loads(self.state_file().read_text())
        session = partial["files"]["rgb.mp4"]["session"]
        self.assertFalse(partial["completed"])
        self.assertIsNotNone(session)
        self.http.on_chunk = None
        result = self.uploader().upload_recording(self.path)
        self.assertEqual(result.folder_id, partial["folder_id"])
        self.assertEqual([item[1] for item in self.http.writes if item[0] == "rgb.mp4"],
                         [0, 256 * 1024, 512 * 1024])
        self.assertEqual(len(self.http.sessions), 4)

    def test_completed_attempt_still_rejects_changed_original_before_network(self):
        self.uploader().upload_recording(self.path)
        previous = self.state_file().read_bytes()
        (self.path / "frames.jsonl").write_bytes(b"changed original")
        self.http.calls.clear()
        with self.assertRaisesRegex(ImportFailure, "変わっています"):
            self.uploader().upload_recording(self.path)
        self.assertEqual(self.http.calls, [])
        self.assertEqual(self.state_file().read_bytes(), previous)


if __name__ == "__main__":
    unittest.main()
