"""Qt workflow checks with isolated local data and a fake USB importer."""

import json
import os
from datetime import datetime
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import ANY, Mock, patch

from PySide6.QtCore import Qt
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

from rootlens_import import desktop
from rootlens_import.core import ClipProgress, FILES, ImportCancelled, ImportFailure
from rootlens_import.device_sync import SyncSummary
from rootlens_import.library import recordings_directory
from rootlens_import.site import SiteProfile, save_site_profile
from unit_fixtures import unit_id


APPLICATION = QApplication.instance() or QApplication([])


def wait_for(condition, timeout=5):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        APPLICATION.processEvents()
        if condition():
            return
        time.sleep(0.01)
    raise AssertionError("GUI work did not complete")


def device_name(index=0):
    return f"rec-20260911T0000{index:02}.000Z"


def make_recording(root, index=0):
    video = f"Synthetic fixture {index}, not real footage.".encode()
    identity = unit_id(index)
    clip = root / identity
    clip.mkdir()
    (clip / "rgb.mp4").write_bytes(video)
    (clip / "frames.jsonl").write_text('{}\n')
    (clip / "imu.jsonl").write_text('{}\n')
    (clip / "metadata.json").write_text(json.dumps({
        "schema": "rootlens.mentra.raw.v1", "files": list(FILES), "unit_id": identity,
        "created_at": f"2026-09-11T00:00:{index:02}.000Z", "actual_duration_ms": 1000,
    }))
    return clip


class DesktopTests(unittest.TestCase):
    def test_recording_labels_show_relative_days_and_year_when_needed(self):
        now = datetime(2026, 9, 16, 12, 0)
        self.assertEqual(desktop.recording_time_label("2026/09/16 08:05:00", now), "今日 08:05")
        self.assertEqual(desktop.recording_time_label("2026/09/15 08:05:00", now), "昨日 08:05")
        self.assertEqual(desktop.recording_time_label("2026/09/14 08:05:00", now), "一昨日 08:05")
        self.assertEqual(desktop.recording_time_label("2026/08/20 08:05:00", now), "08/20 08:05")
        self.assertEqual(desktop.recording_time_label("2025/12/31 08:05:00", now), "2025/12/31 08:05")

    def test_arrow_keys_move_one_recording_at_a_time(self):
        self.populate(3)
        self.window.show()
        self.window.activateWindow()
        APPLICATION.processEvents()
        self.window.recording_list.setFocus()
        QTest.keyClick(self.window.recording_list, Qt.Key.Key_Down)
        self.assertEqual(self.window.recording_list.currentIndex().row(), 1)
        QTest.keyClick(self.window.recording_list, Qt.Key.Key_Right)
        self.assertEqual(self.window.recording_list.currentIndex().row(), 2)
        QTest.keyClick(self.window.recording_list, Qt.Key.Key_Left)
        self.assertEqual(self.window.recording_list.currentIndex().row(), 1)

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.profile_path = self.root / "config/site.json"
        self.profile = SiteProfile("site_fixture", "説明用事業所")
        self.importer = Mock(return_value=SyncSummary(self.root, 0, 0, 0, 0))
        self.window = desktop.ImportWindow(self.profile_path, self.root / "data", self.importer,
                                           drive_reader=lambda profile, hashes, cancel_event, gateway: {},
                                           gateway_factory=lambda profile: object())

    def tearDown(self):
        if self.window.busy:
            self.window.cancel_event.set()
            wait_for(lambda: not self.window.busy)
        self.window.close()
        APPLICATION.processEvents()
        self.window.deleteLater()
        APPLICATION.processEvents()
        self.temporary.cleanup()

    def populate(self, count=2):
        root = recordings_directory(self.profile.site_id, self.root / "data")
        clips = [make_recording(root, i) for i in range(count)]
        self.window.set_profile(self.profile)
        self.window._drive_checked({}, "")
        for index, clip in enumerate(clips):
            self.window._clip_progress(ClipProgress(device_name(index), clip, 'ready'))
        self.window._flush_progress()
        return clips

    def test_startup_does_not_show_local_copies_without_device_confirmation(self):
        root = recordings_directory(self.profile.site_id, self.root / "data")
        clip = make_recording(root)
        save_site_profile(self.profile, self.profile_path)
        self.importer.assert_not_called()
        self.assertEqual(self.window.records, [])
        self.assertEqual(self.window.recording_list.topLevelItemCount(), 0)
        self.assertEqual(self.window.connect_button.toolTip(), "端末を再確認")
        self.assertFalse(self.window.connect_button.isEnabled())

    def test_first_launch_requires_site_before_connection(self):
        self.assertFalse(self.window.connect_button.isEnabled())
        self.window.start_import()
        self.importer.assert_not_called()

    def test_saved_login_restores_site_without_reloading_local_recordings(self):
        account = Mock()
        account.api_origin = "https://www.rootlens.io"
        account.store.load.return_value = "s" * 43
        account.current.return_value = {
            "token": "s" * 43,
            "sites": [{"id": self.profile.site_id, "name": self.profile.site_name}],
        }
        self.window.account = account
        self.window.restore_session()
        wait_for(lambda: self.window.profile is not None)
        self.assertEqual(self.window.profile.site_id, self.profile.site_id)
        self.assertEqual(self.window.records, [])
        self.importer.assert_not_called()

    def test_logout_removes_the_previous_sites_recordings_from_the_window(self):
        self.populate()
        self.assertEqual(len(self.window.records), 2)
        self.window.logout()
        self.assertIsNone(self.window.profile)
        self.assertEqual(self.window.recording_list.topLevelItemCount(), 0)
        self.assertFalse(self.window.upload_button.isEnabled())

    def test_login_completion_saves_and_selects_the_only_site(self):
        self.window.busy = True
        self.window.job_kind = "login"
        self.window._login_finished({"sites": [{"id": "site_live", "name": "営業所"}]}, "")
        self.assertEqual(self.window.profile.site_id, "site_live")
        self.assertEqual(self.window.profile.site_name, "営業所")
        self.assertFalse(self.profile_path.exists())
        self.assertFalse(self.window.busy)

    def test_previous_next_follow_saved_recordings_and_release_old_source(self):
        clips = self.populate()
        self.assertEqual(self.window.preview.path, clips[0] / "rgb.mp4")
        self.assertFalse(self.window.previous_button.isEnabled())
        self.window.select_relative(1)
        self.assertEqual(self.window.selected_recording().path, clips[1])
        self.assertEqual(self.window.preview.path, clips[1] / "rgb.mp4")
        self.assertFalse(self.window.next_button.isEnabled())
        self.window.select_relative(1)
        self.assertEqual(self.window.selected_recording().path, clips[1])
        self.window.select_relative(-1)
        self.assertEqual(self.window.preview.path, clips[0] / "rgb.mp4")

    def test_one_connect_action_retries_and_prevents_overlapping_work(self):
        self.populate(1)
        release = threading.Event()
        started = threading.Event()
        calls = []
        def importer(**kwargs):
            calls.append(kwargs)
            started.set()
            release.wait(3)
            return SyncSummary(kwargs['output'], 0, 1, 0, 0)
        self.window.importer = importer
        self.window.start_import()
        self.assertTrue(started.wait(1))
        self.window.start_import()
        self.assertEqual(len(calls), 1)
        self.assertFalse(self.window.connect_button.isEnabled())
        self.assertEqual(self.window.connect_button.toolTip(), "端末を再確認")
        release.set()
        wait_for(lambda: not self.window.busy)
        self.window.start_import()
        wait_for(lambda: not self.window.busy)
        self.assertEqual(len(calls), 2)
        self.assertTrue(self.window.connect_button.isEnabled())

    def test_drive_read_is_requested_only_from_the_device_sync_worker(self):
        self.populate(1)
        order = []
        identity = unit_id(50)
        snapshots = {identity: object()}
        reader = Mock(side_effect=lambda profile, unit_ids, cancel, gateway: order.append('drive') or snapshots)
        self.window.drive_reader = reader
        def importer(**kwargs):
            order.append('device')
            self.assertNotIn('drive_recordings', kwargs)
            result = kwargs['drive_reader']({identity})
            self.assertIs(result, snapshots)
            kwargs['on_drive_checked'](result, '')
            return SyncSummary(kwargs['output'])
        self.window.importer = importer
        self.window.start_import()
        wait_for(lambda: not self.window.busy)
        self.assertEqual(order, ['device', 'drive'])
        reader.assert_called_once_with(self.profile, {identity}, self.window.cancel_event, ANY)
        self.assertTrue(self.window.drive_synced)

    def test_offline_import_remains_reviewable_but_cannot_upload(self):
        clips = self.populate(1)
        self.window._drive_checked({}, "Google Driveの保存状況を確認できません。")
        self.assertEqual(self.window.selected_recording().path, clips[0])
        self.assertEqual(self.window.preview.path, clips[0] / "rgb.mp4")
        self.assertFalse(self.window.upload_button.isEnabled())
        self.assertTrue(self.window.connect_button.isEnabled())

    def test_ready_progress_adds_clip_and_preserves_current_selection(self):
        clips = self.populate(1)
        added = make_recording(self.window.recordings_root, 1)
        self.window._clip_progress(ClipProgress(device_name(1), added, "ready"))
        wait_for(lambda: len(self.window.records) == 2)
        self.assertEqual(len(self.window.records), 2)
        self.assertEqual(self.window.selected_recording().path, clips[0])
        self.assertEqual(self.window.preview.path, clips[0] / 'rgb.mp4')

    def test_pending_device_clips_are_visible_but_not_playable(self):
        self.populate(1)
        event = ClipProgress("rec-20260911T000099.000Z", None, "importing")
        self.window._clip_progress(event)
        self.window._clip_progress(event)
        wait_for(lambda: self.window.recording_list.topLevelItemCount() == 2)
        self.assertEqual(self.window.recording_list.topLevelItemCount(), 2)
        pending = self.window.recording_list.topLevelItem(1)
        self.assertEqual(pending.text(1), "確認用にコピー中")
        self.assertFalse(pending.flags() & Qt.ItemFlag.ItemIsSelectable)
        self.assertEqual(len(self.window.records), 1)

    def test_import_progress_shows_recording_count_instead_of_looping_animation(self):
        self.window.set_profile(self.profile)
        self.window.busy = True
        self.window.job_kind = "import"
        self.window._clip_progress(ClipProgress(device_name(), None, "importing", position=2, total=4))
        self.assertEqual((self.window.progress.minimum(), self.window.progress.maximum(),
                          self.window.progress.value()), (0, 4, 1))
        self.window._clip_progress(ClipProgress(device_name(), None, "ready", position=2, total=4))
        self.assertEqual(self.window.progress.value(), 2)
        self.window.busy = False
        self.window.job_kind = None

    def test_bulk_progress_is_batched_without_rescanning_local_files(self):
        self.populate(1)
        with patch.object(desktop, 'read_recording', wraps=desktop.read_recording) as scan:
            for index in range(500):
                self.window._clip_progress(ClipProgress(f'pending-{index}', None, 'discovering'))
            self.assertEqual(self.window.recording_list.topLevelItemCount(), 1)
            wait_for(lambda: self.window.recording_list.topLevelItemCount() == 501)
            scan.assert_not_called()

    def test_progress_preserves_library_scroll_position(self):
        self.populate(40)
        self.window.show()
        APPLICATION.processEvents()
        scrollbar = self.window.recording_list.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())
        position = scrollbar.value()
        self.assertGreater(position, 0)
        record = self.window.records[0]
        self.window._clip_progress(ClipProgress(device_name(), record.path, 'verifying'))
        wait_for(lambda: not self.window._refresh_timer.isActive())
        self.assertEqual(scrollbar.value(), position)

    def test_failed_checksum_blocks_only_affected_recording_until_ready(self):
        clips = self.populate(2)
        name = device_name()
        self.window._clip_progress(ClipProgress(name, clips[0], 'error', 'checksum mismatch'))
        self.assertIsNone(self.window.preview.path)
        self.assertFalse(self.window.folder_button.isEnabled())
        wait_for(lambda: not self.window._refresh_timer.isActive())
        self.assertEqual(self.window.selected_recording().path, clips[1])
        failed = self.window.recording_list.topLevelItem(0)
        self.assertTrue(failed.flags() & Qt.ItemFlag.ItemIsSelectable)
        self.window.recording_list.setCurrentItem(failed)
        self.assertEqual(self.window.selected_problem().name, name)
        self.window._clip_progress(ClipProgress(name, clips[0], 'verifying'))
        wait_for(lambda: not self.window._refresh_timer.isActive())
        self.assertTrue(self.window.recording_list.topLevelItem(0).flags() & Qt.ItemFlag.ItemIsSelectable)
        self.window._clip_progress(ClipProgress(name, clips[0], 'ready'))
        wait_for(lambda: not self.window._refresh_timer.isActive())
        self.assertTrue(self.window.recording_list.topLevelItem(0).flags() & Qt.ItemFlag.ItemIsSelectable)

    def test_show_folder_rechecks_all_four_files_before_revealing(self):
        clips = self.populate(1)
        (clips[0] / 'imu.jsonl').unlink()
        with patch.object(desktop, 'reveal_folder') as reveal:
            self.window.show_recording_folder()
        reveal.assert_not_called()
        self.assertFalse(self.window.records)
        self.assertIsNone(self.window.preview.path)

    def test_existing_recordings_remain_selectable_during_import(self):
        clips = self.populate()
        self.window.busy = True
        self.window._update_controls()
        self.window.select_relative(1)
        self.assertEqual(self.window.preview.path, clips[1] / "rgb.mp4")
        self.assertTrue(self.window.folder_button.isEnabled())
        self.window.busy = False

    def test_disconnect_keeps_copy_but_clears_device_list_and_allows_retry(self):
        clips = self.populate(1)
        self.window.importer = Mock(side_effect=ImportFailure("USB未接続"))
        self.window.start_import()
        wait_for(lambda: not self.window.busy)
        self.assertIsNone(self.window.selected_recording())
        self.assertEqual(self.window.recording_list.topLevelItemCount(), 0)
        self.assertTrue(clips[0].is_dir())
        self.assertTrue(self.window.connect_button.isEnabled())
        self.assertIn("USB未接続", self.window.status_label.text())

    def test_show_folder_selects_whole_recording_and_drive_does_not_mark_uploaded(self):
        clips = self.populate(1)
        before = set(clips[0].iterdir())
        with patch.object(desktop, 'reveal_folder') as reveal:
            self.window.show_recording_folder()
        reveal.assert_called_once_with(clips[0])
        with patch.object(desktop.QDesktopServices, 'openUrl', return_value=True) as opened:
            self.window.open_drive()
        self.assertEqual(opened.call_args.args[0].toString(),
                         "https://www.rootlens.io/evidence/sites/site_fixture/approved-data")
        self.assertEqual(set(clips[0].iterdir()), before)
        self.assertEqual(self.window.recording_list.topLevelItem(0).text(1), "確認できます")

    def test_close_cancels_import_before_releasing_window(self):
        self.populate(1)
        def importer(cancel_event, **kwargs):
            if not cancel_event.wait(3):
                raise AssertionError("cancel not requested")
            raise ImportCancelled("cancelled")
        self.window.importer = importer
        self.window.start_import()
        self.window.close()
        self.assertTrue(self.window.cancel_event.is_set())
        self.assertTrue(self.window.closing)
        wait_for(lambda: not self.window.busy)
        self.assertIsNone(self.window.preview.path)

    def test_profile_switch_is_rejected_while_importing(self):
        self.populate(1)
        self.window.busy = True
        with self.assertRaises(ImportFailure):
            self.window.set_profile(self.profile)
        self.window.busy = False

    def test_removed_file_disappears_from_library_and_preview(self):
        clips = self.populate(1)
        (clips[0] / "imu.jsonl").unlink()
        self.window.refresh_recordings()
        self.assertFalse(self.window.records)
        self.assertIsNone(self.window.preview.path)

    def test_new_connection_does_not_reuse_previous_device_rows(self):
        self.populate(2)
        self.window.start_import()
        wait_for(lambda: not self.window.busy)
        self.assertEqual(self.window.recording_list.topLevelItemCount(), 0)
        self.assertIsNone(self.window.preview.path)
        self.assertNotIn("完了", self.window.count_label.text())
        self.assertNotIn("取り込み済み", self.window.status_label.text())

    def test_only_exact_device_verified_path_is_shown_with_same_recording_name(self):
        clips = self.populate(1)
        old = clips[0].with_name(unit_id(999))
        old.mkdir()
        for source in clips[0].iterdir():
            (old / source.name).write_bytes(source.read_bytes())
        metadata = json.loads((old / 'metadata.json').read_text())
        metadata['unit_id'] = unit_id(998)
        (old / 'metadata.json').write_text(json.dumps(metadata))
        self.window.refresh_recordings()
        self.assertEqual([r.path for r in self.window.records], clips)

    def test_ready_after_drive_metadata_mismatch_is_visible(self):
        clips = self.populate(1)
        digest = self.window.records[0].unit_id
        self.window.set_profile(self.profile)
        self.window._drive_checked({digest: object()}, "")
        self.window._clip_progress(ClipProgress(device_name(), clips[0], 'ready'))
        self.window._flush_progress()
        self.assertEqual([r.path for r in self.window.records], clips)

    def test_drive_saved_device_clip_has_no_row_even_without_any_local_copy(self):
        self.window.set_profile(self.profile)
        self.window._drive_checked({unit_id(50): object()}, "")
        self.window._clip_progress(ClipProgress('rec-20260911T000001.000Z', None, 'drive_saved'))
        self.window._flush_progress()
        self.assertEqual(self.window.recording_list.topLevelItemCount(), 0)
        self.assertEqual(self.window.count_label.text(), '撮影データ 0 件')


if __name__ == '__main__':
    unittest.main()
