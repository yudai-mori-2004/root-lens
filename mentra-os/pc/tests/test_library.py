import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from rootlens_import import library
from rootlens_import.core import FILES, ImportFailure


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()

    def tearDown(self):
        self.temporary.cleanup()

    def clip(self, name="rec-20260911T010203.000Z-" + "a" * 12, **fields):
        directory = self.root / name
        directory.mkdir()
        for filename in FILES:
            (directory / filename).write_text("fixture", encoding="utf-8")
        metadata = {
            "schema": "rootlens.mentra.raw.v1", "content_hash": "a" * 64,
            "files": list(FILES), "created_at": "2026-09-11T01:02:03.000Z",
            "actual_duration_ms": 3678000,
        }
        metadata.update(fields)
        (directory / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")
        return directory

    def test_site_directories_preserve_existing_location_without_export_folders(self):
        first = library.recordings_directory("first-site", self.root)
        second = library.recordings_directory("second-site", self.root)
        self.assertNotEqual(first, second)
        self.assertEqual(first, self.root / "first-site/recordings")
        self.assertTrue(first.is_dir())
        self.assertFalse((first.parent / "submissions").exists())

    def test_default_recordings_are_in_local_app_data(self):
        with patch.object(library, "settings_path", return_value=self.root / "app-local" / "site.json"):
            recordings = library.recordings_directory("fixture")
        self.assertEqual(recordings, self.root / "app-local/data/fixture/recordings")

    def test_rejects_site_path_traversal(self):
        for site_id in ("../other", "..", "/absolute", "nested/site", "nested\\site"):
            with self.subTest(site_id=site_id), self.assertRaises(ImportFailure):
                library.recordings_directory(site_id, self.root)

    def test_rejects_links_between_sites(self):
        target = library.recordings_directory("first", self.root)
        second = self.root / "second"
        second.mkdir()
        try:
            (second / "recordings").symlink_to(target, target_is_directory=True)
        except OSError:
            self.skipTest("This machine does not allow symlinks")
        with self.assertRaises(ImportFailure):
            library.recordings_directory("second", self.root)

    def test_lists_complete_recordings_with_duration(self):
        clip = self.clip()
        rows = library.scan_recordings(self.root)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].path, clip)
        self.assertEqual(rows[0].duration_text, "1:01:18")
        self.assertNotEqual("日時情報なし", rows[0].created_text)

    def test_does_not_offer_partial_recordings(self):
        clip = self.clip()
        (clip / "frames.jsonl").unlink()
        self.assertEqual(library.scan_recordings(self.root), [])

    def test_does_not_offer_failed_or_empty_recordings(self):
        clip = self.clip()
        (clip / "failure.json").write_text("{}", encoding="utf-8")
        self.assertEqual(library.scan_recordings(self.root), [])
        (clip / "failure.json").unlink()
        (clip / "rgb.mp4").write_bytes(b"")
        self.assertEqual(library.scan_recordings(self.root), [])

    def test_invalid_metadata_is_not_offered(self):
        self.clip(schema="unsupported")
        self.assertEqual(library.scan_recordings(self.root), [])

    def test_recording_survives_disconnect_and_is_listed_in_shooting_order(self):
        later = self.clip()
        earlier = self.clip(name="rec-20260910T010203.000Z-" + "a" * 12)
        self.assertEqual([row.path for row in library.scan_recordings(self.root)], [earlier, later])
        self.assertEqual([row.path for row in library.scan_recordings(self.root)], [earlier, later])

    def test_mismatched_folder_hash_and_unrelated_folders_are_not_offered(self):
        self.clip(content_hash="b" * 64)
        self.clip(name="unrelated-folder")
        self.assertEqual(library.scan_recordings(self.root), [])

    def test_desktop_metadata_exception_does_not_allow_directories_or_links(self):
        clip = self.clip()
        extra = clip / "Thumbs.db"
        extra.mkdir()
        (extra / "unrelated.txt").write_text("do not upload")
        self.assertEqual(library.scan_recordings(self.root), [])
        (extra / "unrelated.txt").unlink()
        extra.rmdir()
        target = self.root / "private.txt"
        target.write_text("do not upload")
        extra.symlink_to(target)
        self.assertEqual(library.scan_recordings(self.root), [])

    def test_malformed_display_fields_do_not_break_review(self):
        self.clip(actual_duration_ms=float("inf"), created_at=["invalid"])
        rows = library.scan_recordings(self.root)
        self.assertEqual((rows[0].created_text, rows[0].duration_text), ("日時情報なし", "0:00:00"))
