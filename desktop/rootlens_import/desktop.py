"""A recording library with USB import, audiovisual review, and Drive upload."""

import os
from pathlib import Path
import subprocess
import sys
import threading
import webbrowser

from PySide6.QtCore import QObject, Qt, QTimer, QUrl, Signal, Slot
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import (
    QApplication, QDialog, QHBoxLayout, QHeaderView, QLabel, QMainWindow,
    QMessageBox, QProgressBar, QPushButton, QSplitter, QTreeWidget, QTreeWidgetItem,
    QVBoxLayout, QWidget,
)

from .core import ClipProgress, ImportCancelled, ImportFailure
from .device_sync import sync_recordings, cleanup_uploaded_recording
from .branding import APP_NAME, app_icon
from .account import RootLensAccount
from .approval import approve_recording
from .drive import DriveUploader, UploadProgress, UploadResult
from .library import read_recording, recordings_directory, settings_path
from .preview import VideoPreview
from .site import SiteProfile, load_site_profile, save_site_profile


PROGRESS_LABELS = {
    "discovering": "確認中", "importing": "取り込み中", "verifying": "確認中",
    "ready": "未アップロード", "drive_saved": "Driveに保存済み",
    "deleting": "端末から削除中", "cleanup_pending": "端末の削除待ち",
    "incomplete": "録画が未完了", "error": "取り込みエラー",
}


def read_drive_recordings(profile, unit_ids, cancel_event, gateway):
    """Fetch current Drive files without consulting local upload history."""
    uploader = DriveUploader(profile, gateway=gateway)
    try:
        return uploader.current_recordings(unit_ids, cancel_event=cancel_event)
    finally:
        uploader.close()


def byte_text(value):
    size = max(0, int(value))
    if size >= 1024 ** 3:
        return f"{size / 1024 ** 3:.2f} GB"
    if size >= 1024 ** 2:
        return f"{size / 1024 ** 2:.1f} MB"
    if size >= 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size} B"


def reveal_folder(path):
    """Select the complete recording folder for dragging all four files together."""
    path = Path(path)
    if path.is_symlink() or not path.is_dir():
        raise ImportFailure("録画フォルダが見つかりません。スマートグラスをつなぎ直し、もう一度「接続」を押してください。")
    if sys.platform == "darwin":
        subprocess.run(["open", "-R", str(path)], check=True)
    elif os.name == "nt":
        subprocess.Popen(["explorer.exe", "/select," + str(path)])
    elif not QDesktopServices.openUrl(QUrl.fromLocalFile(str(path.parent))):
        raise OSError("フォルダを開けませんでした。")


class ImportSignals(QObject):
    log = Signal(str)
    clip = Signal(object)
    done = Signal(object, str, bool)
    drive_checked = Signal(object, str)
    upload_progress = Signal(object)
    upload_done = Signal(object, str, bool, str)
    login_done = Signal(object, str)


class ImportWindow(QMainWindow):
    def __init__(self, profile_path=None, data_root=None, importer=None,
                 uploader_factory=None, drive_reader=None, cleaner=None, account=None,
                 gateway_factory=None, approver=None):
        super().__init__()
        self.profile_path = Path(profile_path) if profile_path is not None else settings_path()
        self.data_root = data_root
        self.importer = importer or sync_recordings
        self.cleaner = cleaner or cleanup_uploaded_recording
        self.uploader_factory = uploader_factory or DriveUploader
        self.drive_reader = drive_reader or read_drive_recordings
        self.account = account or RootLensAccount()
        self.gateway_factory = gateway_factory or self.account.gateway
        self.approver = approver or approve_recording
        self.profile = None
        self.recordings_root = None
        self.records = []
        self.all_records = []
        self.drive_synced = False
        self.completion_error = ""
        self.upload_states = {}
        self.upload_record = None
        self.upload_saved = False
        self.progress_states = {}
        self.device_sources = {}
        self.recording_names = {}
        self.blocked_names = set()
        self.busy = False
        self.job_kind = None
        self.closing = False
        self.cancel_event = threading.Event()
        self.worker = None
        self._library_dirty = False
        self._refresh_timer = QTimer(self)
        self._refresh_timer.setSingleShot(True)
        self._refresh_timer.setInterval(120)
        self._refresh_timer.timeout.connect(self._flush_progress)
        self.signals = ImportSignals(self)
        queued = Qt.ConnectionType.QueuedConnection
        self.signals.log.connect(self._show_log, queued)
        self.signals.clip.connect(self._clip_progress, queued)
        self.signals.done.connect(self._import_finished, queued)
        self.signals.drive_checked.connect(self._drive_checked, queued)
        self.signals.upload_progress.connect(self._upload_progress, queued)
        self.signals.upload_done.connect(self._upload_finished, queued)
        self.signals.login_done.connect(self._login_finished, queued)
        self._build()
        self._load_saved_profile()

    def _build(self):
        self.setWindowTitle(APP_NAME)
        self.resize(1160, 760)
        self.setMinimumSize(900, 620)
        self.setStyleSheet("""
            QMainWindow, QDialog { background: #f4f5f1; }
            QWidget { color: #1e3028; font-size: 13px; }
            QLabel#title { font-size: 23px; font-weight: 600; }
            QLabel#muted, QLabel#status { color: #5b6a61; }
            QLabel#recordingTitle { font-size: 18px; font-weight: 600; }
            QPushButton { background: #fff; border: 1px solid #c9d0c8; border-radius: 6px; padding: 9px 15px; }
            QPushButton:hover { background: #eaf0e8; }
            QPushButton:disabled { color: #8a958d; background: #ecefe9; }
            QPushButton#connect, QPushButton#upload { background: #28523e; color: #fff; border-color: #28523e; font-weight: 600; }
            QPushButton#connect:disabled, QPushButton#upload:disabled { background: #96a69b; border-color: #96a69b; }
            QTreeWidget { background: #fff; border: 1px solid #d6ddd4; border-radius: 6px; outline: 0; }
            QTreeWidget::item { height: 54px; padding: 4px 8px; border-bottom: 1px solid #edf0e9; }
            QTreeWidget::item:selected { color: #173b28; background: #dcebdd; }
            QHeaderView::section { background: #f4f5f1; border: 0; padding: 9px 8px; color: #5b6a61; }
            QSlider::groove:horizontal { height: 5px; background: #d2dacf; border-radius: 2px; }
            QSlider::sub-page:horizontal { background: #396348; border-radius: 2px; }
            QSlider::handle:horizontal { width: 13px; margin: -4px 0; border-radius: 6px; background: #28523e; }
            QProgressBar { max-height: 4px; border: 0; background: #e4e9df; }
            QProgressBar::chunk { background: #487c56; }
        """)
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(24, 22, 24, 22)
        layout.setSpacing(16)
        header = QHBoxLayout()
        title = QLabel(APP_NAME)
        title.setObjectName("title")
        header.addWidget(title)
        self.site_label = QLabel("事業所：未設定")
        self.site_label.setObjectName("muted")
        header.addWidget(self.site_label)
        header.addStretch()
        self.connect_button = QPushButton("接続")
        self.connect_button.setObjectName("connect")
        self.connect_button.setMinimumWidth(110)
        self.connect_button.clicked.connect(self.start_import)
        header.addWidget(self.connect_button)
        self.settings_button = QPushButton("設定")
        self.settings_button.clicked.connect(self.show_settings)
        header.addWidget(self.settings_button)
        layout.addLayout(header)
        self.status_label = QLabel("「設定」を開き、事業所の設定を読み込んでください。")
        self.status_label.setObjectName("status")
        self.status_label.setWordWrap(True)
        layout.addWidget(self.status_label)
        self.progress = QProgressBar()
        self.progress.setRange(0, 0)
        self.progress.setVisible(False)
        layout.addWidget(self.progress)
        splitter = QSplitter(Qt.Orientation.Horizontal)
        left = QWidget()
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(10)
        self.count_label = QLabel("未アップロード 0 件")
        left_layout.addWidget(self.count_label)
        self.recording_list = QTreeWidget()
        self.recording_list.setColumnCount(2)
        self.recording_list.setHeaderLabels(("撮影日時・長さ", "状態"))
        self.recording_list.setRootIsDecorated(False)
        self.recording_list.setUniformRowHeights(True)
        self.recording_list.setIndentation(0)
        self.recording_list.setSelectionMode(QTreeWidget.SelectionMode.SingleSelection)
        self.recording_list.header().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.recording_list.header().setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents)
        self.recording_list.currentItemChanged.connect(self._selection_changed)
        left_layout.addWidget(self.recording_list, 1)
        splitter.addWidget(left)
        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(18, 0, 0, 0)
        right_layout.setSpacing(14)
        self.recording_title = QLabel("録画を選んでください")
        self.recording_title.setObjectName("recordingTitle")
        right_layout.addWidget(self.recording_title)
        self.preview = VideoPreview()
        right_layout.addWidget(self.preview, 1)
        navigation = QHBoxLayout()
        self.previous_button = QPushButton("前の録画")
        self.previous_button.clicked.connect(lambda: self.select_relative(-1))
        self.next_button = QPushButton("次の録画")
        self.next_button.clicked.connect(lambda: self.select_relative(1))
        navigation.addWidget(self.previous_button)
        navigation.addWidget(self.next_button)
        navigation.addStretch()
        self.position_label = QLabel("—")
        self.position_label.setObjectName("muted")
        navigation.addWidget(self.position_label)
        right_layout.addLayout(navigation)
        instruction = QLabel("内容を確認し、この録画の提供を承認する場合は「アップロード」を押してください。Google Driveの「承認済みデータ」に保存されます。")
        instruction.setWordWrap(True)
        instruction.setObjectName("muted")
        right_layout.addWidget(instruction)
        self.upload_status_label = QLabel("")
        self.upload_status_label.setObjectName("muted")
        self.upload_status_label.setWordWrap(True)
        self.upload_status_label.setVisible(False)
        right_layout.addWidget(self.upload_status_label)
        self.upload_progress_bar = QProgressBar()
        self.upload_progress_bar.setRange(0, 100)
        self.upload_progress_bar.setTextVisible(False)
        self.upload_progress_bar.setVisible(False)
        right_layout.addWidget(self.upload_progress_bar)
        actions = QHBoxLayout()
        self.upload_button = QPushButton("アップロード")
        self.upload_button.setObjectName("upload")
        self.upload_button.clicked.connect(self.start_upload)
        self.cancel_upload_button = QPushButton("キャンセル")
        self.cancel_upload_button.clicked.connect(self.cancel_upload)
        self.cancel_upload_button.setVisible(False)
        self.folder_button = QPushButton("録画フォルダを表示")
        self.folder_button.clicked.connect(self.show_recording_folder)
        self.drive_button = QPushButton("Driveを開く")
        self.drive_button.clicked.connect(self.open_drive)
        actions.addWidget(self.upload_button)
        actions.addWidget(self.cancel_upload_button)
        actions.addStretch()
        actions.addWidget(self.folder_button)
        actions.addWidget(self.drive_button)
        right_layout.addLayout(actions)
        splitter.addWidget(right)
        splitter.setSizes([350, 730])
        splitter.setChildrenCollapsible(False)
        layout.addWidget(splitter, 1)
        self.setCentralWidget(page)
        self._update_controls()

    def _load_saved_profile(self):
        if not self.profile_path.exists():
            self.status_label.setText("「設定」からSMSでログインしてください。")
            return
        try:
            self.set_profile(load_site_profile(self.profile_path))
        except (ImportFailure, OSError, ValueError) as error:
            self.status_label.setText(f"事業所の設定を読み込めません。「設定」から読み込み直してください。\n{error}")

    def set_profile(self, profile):
        if self.busy:
            raise ImportFailure("現在の作業が終わってから事業所を変更してください。")
        directory = recordings_directory(profile.site_id, self.data_root)
        self.preview.clear()
        self.profile = profile
        self.recordings_root = directory
        self.progress_states.clear()
        self.device_sources.clear()
        self.recording_names.clear()
        self.blocked_names.clear()
        self.upload_states.clear()
        self.upload_record = None
        self.all_records.clear()
        self.drive_synced = False
        self.completion_error = ""
        self.upload_status_label.setVisible(False)
        self.upload_progress_bar.setVisible(False)
        self.site_label.setText(profile.site_name)
        self.status_label.setText("スマートグラスをUSB-Cでつなぎ、「接続」を押してください。")
        self.refresh_recordings()
        self._update_controls()

    def show_settings(self):
        if self.busy:
            return
        dialog = QDialog(self)
        dialog.setWindowTitle("事業所の設定")
        dialog.setMinimumWidth(440)
        layout = QVBoxLayout(dialog)
        layout.setContentsMargins(24, 24, 24, 24)
        layout.setSpacing(16)
        current = QLabel(f"現在の事業所：{self.profile.site_name if self.profile else '未設定'}")
        layout.addWidget(current)
        explanation = QLabel("ブラウザでSMSログインした後、このアプリへ戻ります。")
        explanation.setWordWrap(True)
        layout.addWidget(explanation)
        login = QPushButton("SMSでログイン")
        login.clicked.connect(lambda: (dialog.accept(), self.start_login()))
        layout.addWidget(login)
        if self.profile:
            logout = QPushButton("ログアウト")
            logout.clicked.connect(lambda: (dialog.accept(), self.logout()))
            layout.addWidget(logout)
        dialog.exec()

    def start_login(self):
        if self.busy or self.closing:
            return
        self.busy = True
        self.job_kind = "login"
        self.cancel_event.clear()
        self.status_label.setText("ブラウザでRootLensへログインしてください…")
        self.progress.setVisible(True)
        self._update_controls()

        def run():
            try:
                result = self.account.login(webbrowser.open, self.cancel_event)
                self.signals.login_done.emit(result, "")
            except Exception as error:
                self.signals.login_done.emit(None, str(error))
        self.worker = threading.Thread(target=run, name="rootlens-login", daemon=True)
        self.worker.start()

    @Slot(object, str)
    def _login_finished(self, result, error):
        self.busy = False
        self.job_kind = None
        self.worker = None
        self.progress.setVisible(False)
        if error:
            self.status_label.setText(error)
            self._update_controls()
            return
        sites = result["sites"]
        selected = sites[0]
        if len(sites) > 1:
            from PySide6.QtWidgets import QInputDialog
            labels = [site["name"] for site in sites]
            label, accepted = QInputDialog.getItem(self, "事業所を選択", "使用する事業所", labels, 0, False)
            if not accepted:
                self.status_label.setText("事業所を選択してください。")
                self._update_controls()
                return
            selected = sites[labels.index(label)]
        profile = SiteProfile(selected["id"], selected["name"], self.account.api_origin)
        save_site_profile(profile, self.profile_path)
        self.set_profile(profile)

    def logout(self):
        try:
            self.account.logout()
            self.profile_path.unlink(missing_ok=True)
            self.profile = None
            self.recordings_root = None
            self.records = []
            self.all_records = []
            self.refresh_recordings(rescan=False)
            self.site_label.setText("事業所：未設定")
            self.status_label.setText("ログアウトしました。「設定」からRootLensへログインしてください。")
        except ImportFailure as error:
            self.status_label.setText(str(error))
        self._update_controls()

    def selected_recording(self):
        item = self.recording_list.currentItem()
        path = item.data(0, Qt.ItemDataRole.UserRole) if item else None
        return next((record for record in self.records if str(record.path) == path
                     and self._recording_name(record) not in self.blocked_names), None)

    def _recording_name(self, record):
        source = self.device_sources.get(record.unit_id)
        return self.recording_names.get(record.unit_id, getattr(source, "name", record.unit_id))

    def refresh_recordings(self, rescan=True):
        selected = self.selected_recording()
        selected_path = selected.path if selected else None
        scroll_value = self.recording_list.verticalScrollBar().value()
        if rescan:
            self.all_records = []
            for progress in self.progress_states.values():
                if progress.path is None or progress.state not in ("ready", "error"):
                    continue
                try:
                    self.all_records.append(read_recording(progress.path))
                except (ImportFailure, OSError, ValueError, TypeError):
                    continue
            self.all_records.sort(key=lambda record: (record.created_text, record.unit_id))
        self.records = list(self.all_records)
        self.recording_list.blockSignals(True)
        self.recording_list.clear()
        selected_item = None
        ready_names = set()
        for record in self.records:
            remote_name = self._recording_name(record)
            ready_names.add(remote_name)
            progress = self.progress_states.get(remote_name)
            state = PROGRESS_LABELS.get(progress.state, "確認中") if progress else "確認中"
            item = QTreeWidgetItem([f"{record.created_text}\n{record.duration_text}", state])
            item.setData(0, Qt.ItemDataRole.UserRole, str(record.path))
            item.setToolTip(0, record.path.name)
            if remote_name in self.blocked_names:
                item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsSelectable)
                item.setText(1, "取り込みエラー")
            if progress and progress.error:
                item.setToolTip(1, progress.error)
            if record.unit_id in self.upload_states and remote_name not in self.blocked_names:
                item.setText(1, self.upload_states[record.unit_id])
            self.recording_list.addTopLevelItem(item)
            if record.path == selected_path:
                selected_item = item
        for name, progress in self.progress_states.items():
            if name in ready_names or progress.state == "drive_saved":
                continue
            item = QTreeWidgetItem([name, PROGRESS_LABELS.get(progress.state, "確認中")])
            item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsSelectable)
            item.setToolTip(1, progress.error)
            self.recording_list.addTopLevelItem(item)
        if selected_item is None:
            selected_item = next((self.recording_list.topLevelItem(index) for index, record in enumerate(self.records)
                                  if self._recording_name(record) not in self.blocked_names), None)
        self.recording_list.setCurrentItem(selected_item)
        self.recording_list.verticalScrollBar().setValue(scroll_value)
        self.recording_list.blockSignals(False)
        self.count_label.setText(f"アップロード待ち {len(self.records)} 件" if self.drive_synced else "録画一覧")
        self._selection_changed()

    def _selection_changed(self, *_):
        record = self.selected_recording()
        if record:
            self.recording_title.setText(f"{record.created_text}  ·  {record.duration_text}")
            self.preview.load(record.path / "rgb.mp4")
            self.position_label.setText(f"{self.records.index(record) + 1} / {len(self.records)}")
        else:
            self.recording_title.setText("録画を選んでください")
            self.preview.clear()
            self.position_label.setText("—")
        self._update_controls()

    def select_relative(self, offset):
        record = self.selected_recording()
        if record is None:
            return
        index = self.records.index(record) + offset
        while 0 <= index < len(self.records):
            item = self.recording_list.topLevelItem(index)
            if item.flags() & Qt.ItemFlag.ItemIsSelectable:
                self.recording_list.setCurrentItem(item)
                return
            index += offset

    def _update_controls(self):
        if not hasattr(self, "recording_list"):
            return
        record = self.selected_recording()
        index = self.records.index(record) if record else -1
        self.connect_button.setEnabled(bool(self.profile)
                                       and not self.busy and not self.closing)
        self.settings_button.setEnabled(not self.busy and not self.closing)
        self.folder_button.setEnabled(record is not None and not self.closing)
        self.drive_button.setEnabled(self.profile is not None and not self.closing)
        upload_ready = (record is not None and self.profile is not None
                        and not self.busy and not self.closing)
        self.upload_button.setEnabled(bool(upload_ready))
        self.upload_button.setToolTip("" if self.profile
                                     else "「設定」からSMSでログインしてください。")
        self.cancel_upload_button.setVisible(self.busy and self.job_kind == "upload")
        self.cancel_upload_button.setEnabled(self.busy and self.job_kind == "upload" and not self.cancel_event.is_set())
        allowed = [i for i, item in enumerate(self.records)
                   if self._recording_name(item) not in self.blocked_names]
        self.previous_button.setEnabled(index >= 0 and any(i < index for i in allowed))
        self.next_button.setEnabled(index >= 0 and any(i > index for i in allowed))

    def start_import(self):
        if self.profile is None or self.busy or self.closing:
            return
        self.busy = True
        self.device_sources.clear()
        self.recording_names.clear()
        self.job_kind = "import"
        self.cancel_event.clear()
        self.progress_states.clear()
        self.all_records.clear()
        self.drive_synced = False
        self.completion_error = ""
        self.refresh_recordings(rescan=False)
        self.progress.setVisible(True)
        self.status_label.setText("USB接続を確認しています…")
        self._update_controls()
        directory = self.recordings_root
        profile = self.profile

        def run():
            try:
                summary = self.importer(output=directory, log=self.signals.log.emit,
                                        cancel_event=self.cancel_event, on_clip=self.signals.clip.emit,
                                        site_id=profile.site_id,
                                        drive_reader=lambda unit_ids: self.drive_reader(
                                            profile, unit_ids, self.cancel_event, self.gateway_factory(profile)),
                                        on_drive_checked=lambda recordings: self.signals.drive_checked.emit(recordings, ""))
                self.signals.done.emit(summary, "", False)
            except ImportCancelled:
                self.signals.done.emit(None, "", True)
            except Exception as error:
                self.signals.done.emit(None, str(error), False)
        self.worker = threading.Thread(target=run, name="rootlens-usb-import", daemon=True)
        self.worker.start()

    @Slot(object, str)
    def _drive_checked(self, recordings, error):
        self.drive_synced = not error
        self.completion_error = error
        self.refresh_recordings(rescan=False)

    @Slot(str)
    def _show_log(self, text):
        self.status_label.setText(text)

    @Slot(object)
    def _clip_progress(self, progress):
        selected = self.selected_recording()
        self.progress_states[progress.name] = progress
        if progress.path is not None and progress.state in ("ready", "error"):
            try:
                record = read_recording(progress.path)
                self.recording_names[record.unit_id] = progress.name
            except (ImportFailure, OSError, ValueError, TypeError):
                pass
        if progress.state == "error":
            self.blocked_names.add(progress.name)
            if selected and self._recording_name(selected) == progress.name:
                self.preview.clear()
                self._update_controls()
        elif progress.state == "ready":
            self.blocked_names.discard(progress.name)
        self._library_dirty = self._library_dirty or progress.state in ("ready", "error", "drive_saved")
        if not self._refresh_timer.isActive():
            self._refresh_timer.start()

    def _flush_progress(self):
        rescan = self._library_dirty
        self._library_dirty = False
        self.refresh_recordings(rescan=rescan)

    @Slot(object, str, bool)
    def _import_finished(self, summary, error, cancelled):
        self.busy = False
        self.job_kind = None
        self._refresh_timer.stop()
        self._library_dirty = False
        self.progress.setVisible(False)
        if error or cancelled:
            self.progress_states.clear()
            self.drive_synced = False
            self.device_sources.clear()
            self.recording_names.clear()
        else:
            self.device_sources = dict(getattr(summary, "sources", {}))
            self.recording_names.update({unit_id: source.name for unit_id, source in self.device_sources.items()})
        self.refresh_recordings()
        if self.closing:
            self.close()
            return
        if error:
            self.status_label.setText(f"録画を取り込めませんでした。\n{error}")
        elif cancelled:
            self.status_label.setText("確認を中止しました。もう一度「接続」を押してください。")
        else:
            parts = [f"新しく取り込んだ録画 {summary.imported} 件" if summary.imported else "録画の確認が終わりました。"]
            if summary.incomplete:
                parts.append(f"録画が未完了 {summary.incomplete} 件")
            if summary.failed:
                parts.append(f"取り込みエラー {summary.failed} 件")
            if getattr(summary, "cleanup_pending", 0):
                parts.append("端末から削除できなかった録画があります。もう一度「接続」を押してください。")
            if self.completion_error:
                parts.append(self.completion_error)
            self.status_label.setText(" ／ ".join(parts))
        self._update_controls()

    def start_upload(self):
        record = self.selected_recording()
        if (record is None or self.profile is None
                or self.busy or self.closing or self.completion_error):
            return
        try:
            read_recording(record.path)
        except (ImportFailure, OSError, ValueError) as error:
            self.refresh_recordings()
            self.status_label.setText(str(error))
            return
        self.busy = True
        self.job_kind = "upload"
        self.upload_record = record
        self.upload_saved = False
        self.cancel_event.clear()
        self.upload_states[record.unit_id] = "承認待ち"
        self.upload_status_label.setText(f"{record.created_text} — ブラウザで提供を承認してください。")
        self.upload_status_label.setVisible(True)
        self.upload_progress_bar.setRange(0, 0)
        self.upload_progress_bar.setVisible(True)
        self.status_label.setText("ブラウザで、この録画の提供を承認してください。")
        self._update_controls()
        self.refresh_recordings(rescan=False)
        profile = self.profile
        source = self.device_sources.get(record.unit_id)

        def run():
            uploader = None
            result, error, cancelled, cleanup_error = None, "", False, ""
            try:
                gateway = self.gateway_factory(profile)
                approval_event_id = self.approver(
                    record.path, gateway, cancel_event=self.cancel_event, open_browser=webbrowser.open,
                )
                uploader = self.uploader_factory(profile, gateway=gateway)
                result = uploader.upload_recording(record.path, approval_event_id,
                                                   on_progress=self.signals.upload_progress.emit,
                                                   cancel_event=self.cancel_event)
                if isinstance(result, UploadResult) and result.unit_id == record.unit_id:
                    self.signals.upload_progress.emit(UploadProgress(record.unit_id, "cleaning_device",
                                                      result.total_bytes, result.total_bytes))
                    self.signals.log.emit("保存を確認しました。スマートグラスから録画を削除しています…")
                    try:
                        self.cleaner(source, drive_reader=lambda unit_ids: self.drive_reader(
                            profile, unit_ids, self.cancel_event, self.gateway_factory(profile)),
                                     log=self.signals.log.emit, cancel_event=self.cancel_event)
                    except (ImportFailure, OSError):
                        cleanup_error = "アップロードは完了しました。端末からの削除は、次の接続で再試行します。"
                    except Exception:
                        cleanup_error = "アップロードは完了しました。端末から削除できなかったため、もう一度「接続」を押してください。"
            except ImportCancelled:
                cancelled = True
            except ImportFailure as failure:
                error = str(failure)
            except Exception:
                # Unexpected HTTP/library errors can contain request headers or credential details.
                error = "アップロードできませんでした。インターネット接続を確認し、もう一度「アップロード」を押してください。"
            finally:
                if uploader is not None:
                    try:
                        uploader.close()
                    except Exception:
                        pass
            self.signals.upload_done.emit(result, error, cancelled, cleanup_error)
        self.worker = threading.Thread(target=run, name="rootlens-drive-upload", daemon=True)
        self.worker.start()

    @Slot(object)
    def _upload_progress(self, progress):
        if (not self.busy or self.job_kind != "upload" or self.upload_record is None
                or progress.unit_id != self.upload_record.unit_id):
            return
        total = max(0, int(progress.total_bytes))
        transferred = min(total, max(0, int(progress.bytes_uploaded))) if total else 0
        percentage = int(transferred * 100 / total) if total else 0
        labels = {"verifying": "録画を確認中", "uploading": f"アップロード中 {percentage}%",
                  "verifying_remote": "保存結果を確認中", "completed": "保存結果を確認中",
                  "cleaning_device": "端末から削除中"}
        if progress.state == "cleaning_device":
            self.upload_saved = True
        label = labels.get(progress.state, "アップロード中")
        self.upload_states[progress.unit_id] = label
        self.upload_progress_bar.setRange(0, 100 if total else 0)
        if total:
            self.upload_progress_bar.setValue(percentage)
        detail = f"{label} · {byte_text(transferred)} / {byte_text(total)}" if total else label
        self.upload_status_label.setText(f"{self.upload_record.created_text} — {detail}")
        self.status_label.setText(detail)
        if not self._refresh_timer.isActive():
            self._refresh_timer.start()

    def cancel_upload(self):
        if self.busy and self.job_kind == "upload":
            self.cancel_event.set()
            self.upload_status_label.setText("端末からの削除を中止しています…" if self.upload_saved
                                             else "アップロードを中止しています…")
            self._update_controls()

    @Slot(object, str, bool, str)
    def _upload_finished(self, result, error, cancelled, cleanup_error=""):
        record = self.upload_record
        self.busy = False
        self.job_kind = None
        self.upload_record = None
        self._refresh_timer.stop()
        self.upload_progress_bar.setVisible(False)
        verified = (record is not None and isinstance(result, UploadResult)
                    and result.unit_id == record.unit_id and not error and not cancelled)
        if verified:
            name = self._recording_name(record)
            self.progress_states[name] = ClipProgress(name, None,
                "cleanup_pending" if cleanup_error else "drive_saved", cleanup_error)
            self.device_sources.pop(record.unit_id, None)
            self.recording_names.pop(record.unit_id, None)
        self.refresh_recordings()
        if self.closing:
            self.close()
            return
        if record is None:
            return
        if verified:
            self.upload_states.pop(record.unit_id, None)
            text = cleanup_error or f"{record.created_text} のアップロードが完了しました。"
        elif cancelled:
            self.upload_states[record.unit_id] = "中止・再開できます"
            text = "アップロードを中止しました。同じ録画を選んで「アップロード」を押すと再開できます。"
        else:
            self.upload_states[record.unit_id] = "再度アップロードできます"
            text = error or self.completion_error or "アップロードの完了を確認できませんでした。もう一度「アップロード」を押してください。"
        self.status_label.setText(text)
        self.upload_status_label.setText(text)
        self.upload_status_label.setVisible(True)
        self.refresh_recordings(rescan=False)
        self._update_controls()

    def show_recording_folder(self):
        record = self.selected_recording()
        if record:
            try:
                read_recording(record.path)
                reveal_folder(record.path)
            except (ImportFailure, OSError, ValueError, subprocess.SubprocessError) as error:
                self.refresh_recordings()
                self.status_label.setText(str(error))

    def open_drive(self):
        if self.profile and not QDesktopServices.openUrl(QUrl(
                self.profile.api_base_url + "/evidence/sites/" + self.profile.site_id + "/approved-data")):
            self.status_label.setText("Google Driveを開けませんでした。ブラウザから事業所のGoogle Driveを開いてください。")

    def closeEvent(self, event):
        if self.busy:
            self.closing = True
            self.cancel_event.set()
            self.status_label.setText("現在の作業を中止して閉じています…")
            self._update_controls()
            event.ignore()
            return
        self.preview.clear()
        self._refresh_timer.stop()
        self.account.close()
        event.accept()


def main():
    application = QApplication.instance() or QApplication(sys.argv)
    application.setApplicationName(APP_NAME)
    application.setOrganizationName("RootLens")
    application.setWindowIcon(app_icon())
    window = ImportWindow()
    window.show()
    return application.exec()


if __name__ == "__main__":
    sys.exit(main())
