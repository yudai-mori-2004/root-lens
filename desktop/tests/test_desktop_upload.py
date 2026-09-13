"""Drive UI state transitions with synthetic local clips and no network access."""

import hashlib
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import ANY, Mock

from PySide6.QtCore import Qt

from rootlens_import import desktop
from rootlens_import.core import (ClipProgress, FILES, ImportCancelled, ImportFailure,
                                  source_manifest_sha256)
from rootlens_import.device_sync import DeviceSource, SyncSummary
from rootlens_import.drive import DriveRecording, UploadProgress, UploadResult
from rootlens_import.library import read_recording, recordings_directory
from rootlens_import.site import SiteProfile
from test_desktop import APPLICATION, make_recording, wait_for
from unit_fixtures import unit_id


class UploadDesktopTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.profile = SiteProfile("site_upload_ui_test", "説明用事業所")
        self.drive_snapshot = {}
        self.release = threading.Event()
        self.started = threading.Event()
        self.uploader = Mock()
        self.factory = Mock(return_value=self.uploader)
        self.cleaner = Mock(side_effect=self.clean_uploaded_device)
        self.importer = Mock(side_effect=self.import_current_device)
        self.drive_reader = Mock(side_effect=self.read_drive)
        self.approver = Mock(return_value="apv_test")
        self.window = self.new_window()
        directory = recordings_directory(self.profile.site_id, self.root / "data")
        self.clips = [make_recording(directory, i) for i in range(2)]
        self.records = [read_recording(path) for path in self.clips]
        self.names = {record.unit_id: f"rec-20260911T0000{index:02}.000Z"
                      for index, record in enumerate(self.records)}
        self.device_records = list(self.records)
        self.observe_device(self.records)

    def read_drive(self, profile, unit_ids, cancel_event, gateway):
        return {identity: snapshot for identity, snapshot in self.drive_snapshot.items() if identity in unit_ids}

    def source_for(self, record):
        return DeviceSource(Mock(name='original-usb-transport'), 'original-device-serial',
                            '/device/recordings', self.names[record.unit_id],
                            record.unit_id, self.root / 'import-lock')

    def clean_uploaded_device(self, source, **kwargs):
        self.device_records = [record for record in self.device_records
                               if record.unit_id != source.unit_id]

    def observe_device(self, records):
        self.window.set_profile(self.profile)
        self.window._drive_checked({}, "")
        for record in records:
            name = self.names[record.unit_id]
            self.window._clip_progress(ClipProgress(name, record.path, "ready"))
        self.window._flush_progress()
        self.window.device_sources = {record.unit_id: self.source_for(record)
                                      for record in records}

    def import_current_device(self, **kwargs):
        ready = saved = 0
        current = list(self.device_records)
        for record in current:
            kwargs['on_clip'](ClipProgress(self.names[record.unit_id], None, 'discovering'))
        try:
            snapshots = kwargs['drive_reader']({record.unit_id for record in current})
        except ImportFailure:
            raise ImportFailure('Google Driveの保存状況を確認できません') from None
        kwargs['on_drive_checked'](snapshots)
        sources = {}
        for record in current:
            name = self.names[record.unit_id]
            state = 'drive_saved' if record.unit_id in snapshots else 'ready'
            kwargs['on_clip'](ClipProgress(name, record.path, state))
            saved += state == 'drive_saved'
            ready += state == 'ready'
            if state == 'ready':
                sources[record.unit_id] = self.source_for(record)
            else:
                self.device_records.remove(record)
        return SyncSummary(kwargs['output'], existing=ready, cleaned=saved, sources=sources)

    def uploaded_to_drive(self, path, approval_event_id, on_progress, cancel_event):
        self.assertEqual(approval_event_id, "apv_test")
        record = next(record for record in self.records if record.path == path)
        files = {name: {"id": "fake-" + name, "size": (path / name).stat().st_size,
                        "sha256": hashlib.sha256((path / name).read_bytes()).hexdigest()}
                 for name in FILES}
        source_files = {name: {"size": item["size"], "sha256": item["sha256"]}
                        for name, item in files.items()}
        self.drive_snapshot[record.unit_id] = DriveRecording(
            record.unit_id, "folder", path.name, files,
            source_manifest_sha256(record.unit_id, source_files))
        return UploadResult(record.unit_id, "folder", sum(info["size"] for info in files.values()))

    def new_window(self):
        return desktop.ImportWindow(self.root / "absent.json", self.root / "data",
                                    importer=self.importer, uploader_factory=self.factory,
                                    drive_reader=self.drive_reader, cleaner=self.cleaner,
                                    gateway_factory=lambda _profile: object(), approver=self.approver)

    def restart_window(self):
        self.window.close()
        self.window.deleteLater()
        APPLICATION.processEvents()
        self.window = self.new_window()
        self.window.set_profile(self.profile)

    def tearDown(self):
        self.release.set()
        if self.window.busy:
            self.window.cancel_event.set()
            wait_for(lambda: not self.window.busy)
        self.window.close()
        self.window.deleteLater()
        APPLICATION.processEvents()
        self.temporary.cleanup()

    def holding_upload(self, path, approval_event_id, on_progress, cancel_event):
        self.started.set()
        if not self.release.wait(4):
            raise AssertionError("test worker was not released")
        if cancel_event.is_set():
            raise ImportCancelled("cancelled")
        return self.uploaded_to_drive(path, approval_event_id, on_progress, cancel_event)

    def begin_held_upload(self):
        self.uploader.upload_recording.side_effect = self.holding_upload
        self.window.start_upload()
        self.assertTrue(self.started.wait(1))

    def test_upload_has_one_worker_with_fixed_selection_and_keeps_preview_navigation(self):
        main_thread = threading.get_ident()
        factory_threads = []
        self.factory.side_effect = lambda profile, **_kwargs: (factory_threads.append(threading.get_ident()) or self.uploader)
        self.begin_held_upload()
        self.window.start_upload()
        self.window.start_import()
        self.assertEqual(self.factory.call_count, 1)
        self.assertNotEqual(factory_threads, [main_thread])
        self.importer.assert_not_called()
        self.assertFalse(self.window.settings_button.isEnabled())
        self.assertFalse(self.window.connect_button.isEnabled())
        self.assertFalse(self.window.upload_button.isEnabled())
        self.assertEqual(self.window.connect_button.text(), "接続")
        with self.assertRaises(ImportFailure):
            self.window.set_profile(self.profile)
        self.window.select_relative(1)
        self.assertEqual(self.window.preview.path, self.clips[1] / "rgb.mp4")
        self.assertEqual(self.window.upload_record.path, self.clips[0])
        self.assertEqual(self.uploader.upload_recording.call_args.args, (self.clips[0], "apv_test"))
        self.approver.assert_called_once_with(
            self.clips[0], ANY, cancel_event=self.window.cancel_event, open_browser=ANY)
        self.assertTrue(self.window.folder_button.isEnabled())

    def test_upload_does_not_start_when_explicit_approval_fails(self):
        self.approver.side_effect = ImportFailure("承認されませんでした")
        self.window.start_upload()
        wait_for(lambda: not self.window.busy)
        self.uploader.upload_recording.assert_not_called()
        self.assertIn("承認されませんでした", self.window.status_label.text())
        self.assertEqual([record.path for record in self.window.records], self.clips)

    def test_progress_does_not_hide_recording_before_verified_upload_result(self):
        self.begin_held_upload()
        digest = self.records[0].unit_id
        self.window._upload_progress(UploadProgress(digest, "uploading", 1024, 4096, "rgb.mp4"))
        wait_for(lambda: not self.window._refresh_timer.isActive())
        self.assertEqual(self.window.upload_progress_bar.value(), 25)
        self.assertIn("25%", self.window.recording_list.topLevelItem(0).text(1))
        self.assertIn("1.0 KB / 4.0 KB", self.window.status_label.text())
        before = self.window.status_label.text()
        self.window._upload_progress(UploadProgress(unit_id(999), "uploading", 4096, 4096))
        self.assertEqual(self.window.status_label.text(), before)
        self.window._upload_progress(UploadProgress(digest, "completed", 4096, 4096))
        wait_for(lambda: not self.window._refresh_timer.isActive())
        self.assertEqual(len(self.window.records), 2)
        self.assertNotIn("完了", self.window.status_label.text())
        self.release.set()
        wait_for(lambda: not self.window.busy)
        self.assertEqual([record.path for record in self.window.records], [self.clips[1]])
        self.assertIn("アップロードが完了", self.window.status_label.text())
        self.assertTrue(self.window.upload_button.isEnabled())
        self.drive_reader.assert_not_called()
        self.uploader.close.assert_called_once()

    def test_completed_upload_removes_last_row_and_clears_preview(self):
        self.observe_device(self.records[:1])
        self.uploader.upload_recording.side_effect = self.uploaded_to_drive
        self.window.start_upload()
        wait_for(lambda: not self.window.busy)
        self.assertEqual(self.window.records, [])
        self.assertEqual(self.window.recording_list.topLevelItemCount(), 0)
        self.assertIsNone(self.window.preview.path)
        self.assertFalse(self.window.upload_button.isEnabled())
        self.assertEqual({p.name for p in self.clips[0].iterdir()}, set(FILES))
        self.assertIn("アップロードが完了", self.window.status_label.text())
        self.assertEqual(self.window.count_label.text(), "アップロード待ち 0 件")

    def test_restart_does_not_rebuild_pending_list_from_local_copies(self):
        self.uploader.upload_recording.side_effect = self.uploaded_to_drive
        self.window.start_upload()
        wait_for(lambda: not self.window.busy)
        self.assertEqual([record.path for record in self.window.records], [self.clips[1]])
        self.restart_window()
        self.assertEqual(self.window.records, [])
        self.assertEqual(self.window.recording_list.topLevelItemCount(), 0)
        self.assertIsNone(self.window.preview.path)
        self.importer.assert_not_called()
        self.drive_reader.assert_not_called()
        self.window.start_import()
        wait_for(lambda: not self.window.busy)
        self.assertEqual([record.path for record in self.window.records], [self.clips[1]])
        self.assertEqual(self.window.recording_list.topLevelItemCount(), 1)
        self.assertEqual(self.window.count_label.text(), "アップロード待ち 1 件")
        self.assertNotIn('drive_recordings', self.importer.call_args.kwargs)
        self.assertEqual(self.drive_reader.call_args.args[1], {self.records[1].unit_id})
        self.assertEqual({p.name for p in self.clips[0].iterdir()}, set(FILES))

    def test_drive_deletion_does_not_resurrect_a_removed_device_clip_from_local_copy(self):
        self.uploader.upload_recording.side_effect = self.uploaded_to_drive
        self.window.start_upload()
        wait_for(lambda: not self.window.busy)
        self.assertEqual(self.device_records, self.records[1:])
        self.drive_snapshot.clear()
        self.window.start_import()
        wait_for(lambda: not self.window.busy)
        self.assertEqual([record.path for record in self.window.records], [self.clips[1]])
        self.assertEqual(self.window.count_label.text(), 'アップロード待ち 1 件')
        self.assertEqual(self.drive_reader.call_args.args[1], {self.records[1].unit_id})
        self.assertEqual({p.name for p in self.clips[0].iterdir()}, set(FILES))

    def test_cleanup_uses_original_source_even_when_preview_selection_changes(self):
        self.window.start_import()
        wait_for(lambda: not self.window.busy)
        self.drive_reader.reset_mock()
        original = self.window.device_sources[self.records[0].unit_id]
        self.begin_held_upload()
        self.window.select_relative(1)
        self.release.set()
        wait_for(lambda: not self.window.busy)
        self.cleaner.assert_called_once()
        self.assertIs(self.cleaner.call_args.args[0], original)
        self.assertIs(self.cleaner.call_args.kwargs['cancel_event'], self.window.cancel_event)
        self.cleaner.call_args.kwargs['drive_reader']({original.unit_id})
        self.drive_reader.assert_called_once_with(
            self.profile, {original.unit_id}, self.window.cancel_event, ANY)
        self.assertEqual(self.window.selected_recording().path, self.clips[1])

    def test_cleanup_failure_keeps_drive_success_as_non_uploadable_pending_row(self):
        self.observe_device(self.records[:1])
        self.uploader.upload_recording.side_effect = self.uploaded_to_drive
        self.cleaner.side_effect = ImportFailure('USB disconnected')
        self.window.start_upload()
        wait_for(lambda: not self.window.busy)
        self.assertEqual(self.window.records, [])
        self.assertEqual(self.window.recording_list.topLevelItemCount(), 1)
        row = self.window.recording_list.topLevelItem(0)
        self.assertEqual(row.text(1), '端末の削除待ち')
        self.assertFalse(row.flags() & Qt.ItemFlag.ItemIsSelectable)
        self.assertFalse(self.window.upload_button.isEnabled())
        self.assertIsNone(self.window.preview.path)
        self.assertIn('アップロードは完了', self.window.status_label.text())
        self.assertIn('次の接続', self.window.status_label.text())
        self.assertIn(self.records[0].unit_id, self.drive_snapshot)
        self.window.start_upload()
        self.assertEqual(self.uploader.upload_recording.call_count, 1)
        self.window.start_import()
        wait_for(lambda: not self.window.busy)
        self.assertEqual([record.path for record in self.window.records], [self.clips[1]])
        self.assertEqual(self.uploader.upload_recording.call_count, 1)
        self.assertTrue(all(record.unit_id != self.records[0].unit_id for record in self.device_records))

    def test_cancel_during_cleanup_preserves_upload_success_and_allows_next_connection(self):
        self.observe_device(self.records[:1])
        self.uploader.upload_recording.side_effect = self.uploaded_to_drive
        entered = threading.Event()
        def cleaning(source, cancel_event, **kwargs):
            entered.set()
            if not cancel_event.wait(3):
                raise AssertionError('cleanup was not cancelled')
            raise ImportCancelled('cancelled after verified Drive upload')
        self.cleaner.side_effect = cleaning
        self.window.start_upload()
        self.assertTrue(entered.wait(1))
        wait_for(lambda: self.window.upload_saved and not self.window._refresh_timer.isActive())
        self.assertIn('端末から削除中', self.window.upload_status_label.text())
        self.assertEqual(self.window.recording_list.topLevelItem(0).text(1), '端末から削除中')
        self.assertEqual(self.window.upload_progress_bar.value(), 100)
        self.window.cancel_upload()
        self.assertEqual(self.window.upload_status_label.text(), '端末からの削除を中止しています…')
        self.assertFalse(self.window.cancel_upload_button.isEnabled())
        wait_for(lambda: not self.window.busy)
        self.assertIn('アップロードは完了', self.window.status_label.text())
        self.assertIn('次の接続', self.window.status_label.text())
        self.assertEqual(self.window.recording_list.topLevelItem(0).text(1), '端末の削除待ち')
        self.assertFalse(self.window.upload_button.isEnabled())
        self.assertTrue(self.window.connect_button.isEnabled())
        self.assertIsNone(self.window.preview.path)
        self.assertIn(self.records[0].unit_id, self.drive_snapshot)

    def test_closing_after_upload_success_cancels_cleanup_before_window_release(self):
        self.observe_device(self.records[:1])
        self.uploader.upload_recording.side_effect = self.uploaded_to_drive
        entered = threading.Event()
        def cleaning(source, cancel_event, **kwargs):
            entered.set()
            if not cancel_event.wait(3):
                raise AssertionError('cleanup was not cancelled')
            raise ImportCancelled('cleanup interrupted')
        self.cleaner.side_effect = cleaning
        self.window.start_upload()
        self.assertTrue(entered.wait(1))
        self.window.close()
        self.assertTrue(self.window.closing)
        self.assertTrue(self.window.cancel_event.is_set())
        wait_for(lambda: not self.window.busy)
        self.assertIsNone(self.window.preview.path)
        self.assertEqual(self.window.progress_states[self.names[self.records[0].unit_id]].state,
                         'cleanup_pending')
        self.assertIn(self.records[0].unit_id, self.drive_snapshot)
        self.uploader.close.assert_called_once()

    def test_unexpected_cleanup_error_keeps_saved_state_without_exposing_details(self):
        self.observe_device(self.records[:1])
        self.uploader.upload_recording.side_effect = self.uploaded_to_drive
        self.cleaner.side_effect = RuntimeError('private_key=cleanup-secret')
        self.window.start_upload()
        wait_for(lambda: not self.window.busy)
        self.assertIn('アップロードは完了', self.window.status_label.text())
        self.assertNotIn('private_key', self.window.status_label.text())
        self.assertNotIn('cleanup-secret', self.window.upload_status_label.text())
        self.assertEqual(self.window.recording_list.topLevelItem(0).text(1), '端末の削除待ち')
        self.assertFalse(self.window.upload_button.isEnabled())

    def test_invalid_or_mismatched_upload_result_does_not_hide_recording(self):
        for result in (None, UploadResult(unit_id(999), "folder", 100)):
            with self.subTest(result=result):
                self.uploader.upload_recording.return_value = result
                self.window.start_upload()
                wait_for(lambda: not self.window.busy)
                self.assertEqual([record.path for record in self.window.records], self.clips)
                self.assertIn("完了を確認できません", self.window.status_label.text())
                self.assertTrue(self.window.upload_button.isEnabled())
                self.cleaner.assert_not_called()

    def test_cancellation_preserves_clip_and_retry_uses_same_action(self):
        self.begin_held_upload()
        self.window.cancel_upload()
        self.assertTrue(self.window.cancel_event.is_set())
        self.assertFalse(self.window.cancel_upload_button.isEnabled())
        self.release.set()
        wait_for(lambda: not self.window.busy)
        self.assertEqual(len(self.window.records), 2)
        self.assertIn("中止", self.window.status_label.text())
        self.assertEqual(self.window.upload_button.text(), "アップロード")
        self.assertTrue(self.window.upload_button.isEnabled())
        self.assertEqual({p.name for p in self.clips[0].iterdir()}, set(FILES))
        self.uploader.upload_recording.side_effect = ImportFailure("通信が途切れました")
        self.window.start_upload()
        wait_for(lambda: not self.window.busy)
        self.assertEqual(self.factory.call_count, 2)
        self.assertFalse(self.window.cancel_event.is_set())
        self.assertIn("通信が途切れました", self.window.status_label.text())
        self.assertEqual(self.uploader.close.call_count, 2)

    def test_unexpected_upload_error_does_not_expose_credentials(self):
        self.uploader.upload_recording.side_effect = RuntimeError("private_key=super-secret-token")
        self.window.start_upload()
        wait_for(lambda: not self.window.busy)
        self.assertNotIn("super-secret", self.window.status_label.text())
        self.assertNotIn("private_key", self.window.upload_status_label.text())
        self.assertEqual(len(self.window.records), 2)
        self.assertTrue(self.window.upload_button.isEnabled())

    def test_closing_cancels_upload_and_waits_before_releasing_preview(self):
        self.begin_held_upload()
        self.window.close()
        self.assertTrue(self.window.busy)
        self.assertTrue(self.window.closing)
        self.assertTrue(self.window.cancel_event.is_set())
        self.assertIn("現在の作業", self.window.status_label.text())
        self.release.set()
        wait_for(lambda: not self.window.busy)
        self.assertIsNone(self.window.preview.path)
        self.uploader.close.assert_called_once()

    def test_upload_rechecks_four_files_before_starting_worker(self):
        (self.clips[0] / "imu.jsonl").unlink()
        self.window.start_upload()
        self.factory.assert_not_called()
        self.assertEqual([r.path for r in self.window.records], [self.clips[1]])

    def test_drive_error_from_device_sync_leaves_no_unverified_list(self):
        self.drive_reader.side_effect = ImportFailure("Drive unavailable")
        self.window.start_import()
        wait_for(lambda: not self.window.busy)
        self.importer.assert_called_once()
        self.assertEqual(self.window.records, [])
        self.assertEqual(self.window.recording_list.topLevelItemCount(), 0)
        self.assertIsNone(self.window.preview.path)
        self.assertFalse(self.window.drive_synced)
        self.assertFalse(self.window.upload_button.isEnabled())
        self.assertTrue(self.window.connect_button.isEnabled())
        self.assertIn("Google Driveの保存状況を確認できません", self.window.status_label.text())
        self.window.start_upload()
        self.factory.assert_not_called()
        self.drive_reader.side_effect = self.read_drive
        self.window.start_import()
        wait_for(lambda: not self.window.busy)
        self.assertEqual(self.importer.call_count, 2)
        self.assertEqual([record.path for record in self.window.records], self.clips)
        self.assertTrue(self.window.upload_button.isEnabled())


if __name__ == "__main__":
    unittest.main()
