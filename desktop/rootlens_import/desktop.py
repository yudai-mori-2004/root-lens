"""A recording library with USB import, audiovisual review, and Drive upload."""

import os
from pathlib import Path
import subprocess
import sys
import threading
from datetime import datetime, timedelta, timezone

from PySide6.QtCore import QObject, QSize, Qt, QTimer, QUrl, Signal, Slot
from PySide6.QtGui import QAction, QColor, QDesktopServices, QFont, QIcon, QKeySequence, QPainter, QShortcut
from PySide6.QtWidgets import (
    QApplication, QHBoxLayout, QHeaderView, QLabel, QMainWindow,
    QMenu, QMessageBox, QProgressBar, QPushButton, QSplitter, QStyledItemDelegate,
    QStyle, QTreeWidget, QTreeWidgetItem, QVBoxLayout, QWidget,
)

from .core import Adb, ClipProgress, ImportCancelled, ImportFailure
from .device_sync import (sync_recordings, cleanup_uploaded_recording, discard_unapproved_recording,
                          discard_problem_capture, delete_saved_capture,
                          remove_uploaded_local_copy, probe_transport)
from .branding import APP_NAME, app_icon
from .icons import icon
from .account import RootLensAccount, SessionStore
from .approval import approve_recording
from .drive import DriveUploader, UploadProgress, UploadResult
from .library import read_recording, recordings_directory, settings_path
from .preview import VideoPreview
from .screen_state import Phase, ScreenState, screen_phase
from .site import SiteProfile
from .workspace import WorkWorkspace


PROGRESS_LABELS = {
    "discovering": "端末を確認中", "importing": "確認用にコピー中",
    "verifying": "端末と確認用データを照合中",
    "ready": "確認できます", "drive_saved": "Driveに保存済み",
    "deleting": "端末から削除中", "cleanup_pending": "端末の削除待ち",
    "local_cleanup_pending": "PCのコピー削除待ち",
    "incomplete": "端末の保存未完了", "error": "取り込みエラー",
}
SELECTABLE_STATES = frozenset({"ready", "incomplete", "error", "cleanup_pending"})
REVIEW_GUIDE = ("映像と音声を確認し、提供に適した録画だけを承認してください。"
                "撮影ミスや作業中の手元が確認できない録画、同意していない人や"
                "撮影を避ける対象が含まれる録画は、承認せずに削除してください。")


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


def recording_time_label(created_text, now=None):
    try:
        recorded = datetime.strptime(created_text, "%Y/%m/%d %H:%M:%S")
    except ValueError:
        return created_text
    today = (now or datetime.now()).date()
    if recorded.date() == today:
        prefix = "今日"
    elif recorded.date() == today - timedelta(days=1):
        prefix = "昨日"
    elif recorded.date() == today - timedelta(days=2):
        prefix = "一昨日"
    elif recorded.year == today.year:
        prefix = recorded.strftime("%m/%d")
    else:
        prefix = recorded.strftime("%Y/%m/%d")
    return f"{prefix} {recorded:%H:%M}"


def problem_time_label(name):
    try:
        captured = datetime.strptime(name, "rec-%Y%m%dT%H%M%S.%fZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return "日時を確認できません"
    return recording_time_label(captured.astimezone().strftime("%Y/%m/%d %H:%M:%S"))


def reveal_folder(path):
    """Select the complete recording folder for dragging all four files together."""
    path = Path(path)
    if path.is_symlink() or not path.is_dir():
        raise ImportFailure("録画フォルダが見つかりません。スマートグラスをつなぎ直し、「端末を再確認」を押してください。")
    if sys.platform == "darwin":
        subprocess.run(["open", "-R", str(path)], check=True)
    elif os.name == "nt":
        subprocess.Popen(["explorer.exe", "/select," + str(path)])
    elif not QDesktopServices.openUrl(QUrl.fromLocalFile(str(path.parent))):
        raise OSError("フォルダを開けませんでした。")


class ImportSignals(QObject):
    log = Signal(str)
    clip = Signal(object)
    source = Signal(object)
    device = Signal(object, str)
    done = Signal(object, str, bool)
    drive_checked = Signal(object, str)
    upload_progress = Signal(object)
    upload_done = Signal(object, str, bool, str)
    login_done = Signal(object, str)
    browser_requested = Signal(str, object, object)
    approval_done = Signal()
    connection_checked = Signal(object, bool)
    discard_done = Signal(object, str, bool)


class RecordingCard(QStyledItemDelegate):
    def sizeHint(self, option, index):
        return QSize(option.rect.width(), 72)

    def paint(self, painter, option, index):
        painter.save()
        card = option.rect.adjusted(0, 3, -4, -3)
        selected = bool(option.state & QStyle.StateFlag.State_Selected)
        painter.fillRect(card, QColor("#ffedbd" if selected else "#ffffff"))
        lines = str(index.data(Qt.ItemDataRole.DisplayRole) or "").split("\n", 1)
        painter.setPen(QColor("#171717"))
        title = QFont(option.font)
        title.setBold(True)
        title.setPointSize(12)
        painter.setFont(title)
        painter.drawText(card.adjusted(16, 7, -12, -34), Qt.AlignmentFlag.AlignVCenter,
                         painter.fontMetrics().elidedText(lines[0], Qt.TextElideMode.ElideRight, card.width() - 28))
        chip = index.data(Qt.ItemDataRole.UserRole + 1)
        chip_width = 0
        if chip:
            chip_font = QFont(option.font)
            chip_font.setPointSize(11)
            painter.setFont(chip_font)
            loading = bool(index.data(Qt.ItemDataRole.UserRole + 3))
            chip_width = painter.fontMetrics().horizontalAdvance("•••" if loading else chip) + 22
            chip_rect = card.adjusted(card.width() - chip_width - 10, 37, -10, -8)
            painter.setRenderHint(QPainter.RenderHint.Antialiasing)
            painter.setPen(QColor("#d2c59d" if loading else "#aaa9a3"))
            painter.setBrush(QColor("#fff4d6" if loading else "#f7f7f4"))
            painter.drawRoundedRect(chip_rect, 11, 11)
            painter.setPen(QColor("#343434"))
            painter.drawText(chip_rect, Qt.AlignmentFlag.AlignCenter, chip)
        if len(lines) > 1:
            detail = QFont(option.font)
            detail.setPointSize(11)
            painter.setFont(detail)
            painter.setPen(QColor("#575757"))
            detail_left = 16
            if index.data(Qt.ItemDataRole.UserRole) and not index.data(Qt.ItemDataRole.UserRole + 2):
                icon("play", size=14).paint(painter, card.adjusted(15, 43, -card.width() + 29, -12))
                detail_left = 34
            painter.drawText(card.adjusted(detail_left, 39, -chip_width - 18, -7), Qt.AlignmentFlag.AlignVCenter,
                             painter.fontMetrics().elidedText(lines[1], Qt.TextElideMode.ElideRight,
                                                            card.width() - chip_width - detail_left - 18))
        painter.restore()


class NoticeLabel(QLabel):
    def setText(self, text):
        super().setText(text)
        self.setVisible(bool(text))


class ImportWindow(QMainWindow):
    def __init__(self, profile_path=None, data_root=None, importer=None,
                 uploader_factory=None, drive_reader=None, cleaner=None, account=None,
                 gateway_factory=None, approver=None):
        super().__init__()
        self.profile_path = Path(profile_path) if profile_path is not None else settings_path()
        self.workspace = WorkWorkspace() if data_root is None else None
        self.data_root = self.workspace.path if self.workspace is not None else Path(data_root)
        self.importer = importer or sync_recordings
        self.cleaner = cleaner or cleanup_uploaded_recording
        self.uploader_factory = uploader_factory or DriveUploader
        self.drive_reader = drive_reader or read_drive_recordings
        self.account = account or RootLensAccount(store=SessionStore(self.profile_path.with_name("session.token")))
        self.gateway_factory = gateway_factory or self.account.gateway
        self.approver = approver or approve_recording
        self.browser = None
        self.profile = None
        self.pending_profile = None
        self.reconnect_after_switch = False
        self.pending_discard = None
        self.sites = []
        self.account_last4 = None
        self.device_transport = None
        self.device_root = None
        self.device_connected = False
        self.connection_check_running = False
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
        self.uploaded_unit_ids = set()
        self.recording_names = {}
        self.blocked_names = set()
        self.busy = False
        self.job_kind = None
        self.closing = False
        self.cancel_event = threading.Event()
        self.worker = None
        self.upload_running = False
        self.approval_pending = False
        self.upload_cancel_event = threading.Event()
        self.upload_worker = None
        self._library_dirty = False
        self._refresh_timer = QTimer(self)
        self.loading_timer = QTimer(self)
        self.loading_timer.setInterval(500)
        self.loading_timer.timeout.connect(self._animate_loading)
        self.loading_phase = 0
        self._refresh_timer.setSingleShot(True)
        self._refresh_timer.setInterval(120)
        self._refresh_timer.timeout.connect(self._flush_progress)
        self.signals = ImportSignals(self)
        queued = Qt.ConnectionType.QueuedConnection
        self.signals.log.connect(self._show_log, queued)
        self.signals.clip.connect(self._clip_progress, queued)
        self.signals.source.connect(self._source_available, queued)
        self.signals.device.connect(self._device_available, queued)
        self.signals.done.connect(self._import_finished, queued)
        self.signals.drive_checked.connect(self._drive_checked, queued)
        self.signals.upload_progress.connect(self._upload_progress, queued)
        self.signals.upload_done.connect(self._upload_finished, queued)
        self.signals.login_done.connect(self._login_finished, queued)
        self.signals.browser_requested.connect(self._show_browser, queued)
        self.signals.approval_done.connect(self._approval_complete, queued)
        self.signals.connection_checked.connect(self._connection_checked, queued)
        self.signals.discard_done.connect(self._discard_finished, queued)
        self.connection_timer = QTimer(self)
        self.connection_timer.setInterval(2500)
        self.connection_timer.timeout.connect(self._check_connection)
        self._build()
        self.status_label.setText("画面上部の「SMSでログイン」を押してください。")
        if profile_path is None and data_root is None:
            QTimer.singleShot(0, self.restore_session)

    def _build(self):
        self.setWindowTitle("RootLens Importer")
        self.resize(1180, 680)
        self.setMinimumSize(840, 560)
        self.setStyleSheet("""
            QMainWindow, QWidget { background: #ffffff; color: #191919; font-size: 14px; }
            QLabel#title { font-size: 23px; font-weight: 700; }
            QLabel#muted, QLabel#status { color: #5d5d5d; }
            QLabel#recordingTitle { font-size: 18px; font-weight: 700; }
            QLabel#count, QLabel#approvalTitle { font-size: 16px; font-weight: 700; }
            QPushButton { background: #ffffff; border: 1px solid #777777; border-radius: 0;
                          padding: 8px 15px; min-height: 23px; }
            QPushButton:hover { background: #f4f4f2; }
            QPushButton:focus { border: 2px solid #191919; }
            QPushButton:disabled { color: #777777; background: #f5f5f3; border-color: #c9c9c5; }
            QPushButton#upload { background: #e5efc6; color: #111111; border-color: #777777;
                                 font-weight: 700; min-width: 186px; }
            QPushButton#upload:hover { background: #d7e8a8; }
            QPushButton#upload:disabled { background: #f5f5f3; color: #777777; border-color: #c9c9c5; }
            QPushButton#siteMenu, QPushButton#textNav { border: 0; background: transparent; padding: 0; }
            QPushButton#siteMenu { color: #222222; font-weight: 600; }
            QPushButton#textNav { color: #5d5d5d; font-size: 13px; min-height: 0; }
            QPushButton#textNav:hover, QPushButton#siteMenu:hover { text-decoration: underline; }
            QPushButton#iconAction { border: 1px solid #d3d3cf; border-radius: 6px; padding: 5px; }
            QLabel#connectionStatus { border-radius: 12px; padding: 6px 10px; font-size: 12px; font-weight: 600; }
            QLabel#reviewGuide { color: #545454; font-size: 13px; }
            QWidget#header { border-bottom: 1px solid #dedede; }
            QWidget#recordingRail { background: #f6f6f6; }
            QTreeWidget { background: #f6f6f6; border: 0; outline: 0; }
            QTreeWidget::item { border: 0; }
            QSplitter::handle { background: #e5e5e5; width: 1px; }
            QProgressBar { max-height: 4px; border: 0; background: #eeeeeb; }
            QProgressBar::chunk { background: #a8c968; }
        """)
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        header_box = QWidget()
        header_box.setObjectName("header")
        header = QHBoxLayout()
        header.setContentsMargins(28, 16, 28, 16)
        title = QLabel("RootLens Importer")
        title.setObjectName("title")
        header.addWidget(title, 1)
        self.site_label = QPushButton("SMSでログイン")
        self.site_label.setObjectName("siteMenu")
        self.site_label.clicked.connect(self.show_site_menu)
        header.addWidget(self.site_label, 1, Qt.AlignmentFlag.AlignCenter)
        self.settings_button = self.site_label
        header.addStretch()
        self.connection_box = QWidget()
        self.connection_box.setObjectName("connectionStatus")
        connection_layout = QHBoxLayout(self.connection_box)
        connection_layout.setContentsMargins(9, 4, 11, 4)
        connection_layout.setSpacing(5)
        self.connection_icon = QLabel()
        self.connection_icon.setFixedSize(16, 16)
        connection_layout.addWidget(self.connection_icon)
        self.connection_label = QLabel("未接続")
        connection_layout.addWidget(self.connection_label)
        header.addWidget(self.connection_box)
        self.connect_button = QPushButton("")
        self.connect_button.setObjectName("iconAction")
        self.connect_button.setIcon(icon("refresh-cw", size=19))
        self.connect_button.setToolTip("端末を再確認")
        self.connect_button.setFixedSize(36, 36)
        self.connect_button.setIconSize(QSize(19, 19))
        self.connect_button.clicked.connect(self.start_import)
        header.addWidget(self.connect_button)
        header_box.setLayout(header)
        layout.addWidget(header_box)
        self.status_label = NoticeLabel("")
        self.status_label.setObjectName("status")
        self.status_label.setWordWrap(True)
        self.status_label.setContentsMargins(28, 9, 28, 9)
        self.status_label.setVisible(False)
        layout.addWidget(self.status_label)
        self.progress = QProgressBar()
        self.progress.setRange(0, 0)
        self.progress.setTextVisible(False)
        self.progress.setVisible(False)
        layout.addWidget(self.progress)
        splitter = QSplitter(Qt.Orientation.Horizontal)
        left = QWidget()
        left.setObjectName("recordingRail")
        left_layout = QVBoxLayout(left)
        left_layout.setContentsMargins(14, 20, 10, 0)
        left_layout.setSpacing(12)
        self.count_label = QLabel("撮影データ 0 件")
        self.count_label.setObjectName("count")
        self.count_label.setWordWrap(True)
        left_layout.addWidget(self.count_label)
        self.recording_list = QTreeWidget()
        self.recording_list.setColumnCount(2)
        self.recording_list.setHeaderHidden(True)
        self.recording_list.setRootIsDecorated(False)
        self.recording_list.setUniformRowHeights(True)
        self.recording_list.setIndentation(0)
        self.recording_list.setSelectionMode(QTreeWidget.SelectionMode.SingleSelection)
        self.recording_list.header().setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        self.recording_list.setColumnHidden(1, True)
        self.recording_list.setItemDelegateForColumn(0, RecordingCard(self.recording_list))
        self.recording_list.currentItemChanged.connect(self._selection_changed)
        left_layout.addWidget(self.recording_list, 1)
        splitter.addWidget(left)
        right = QWidget()
        right_layout = QVBoxLayout(right)
        right_layout.setContentsMargins(32, 18, 30, 30)
        right_layout.setSpacing(14)
        video_header = QHBoxLayout()
        self.recording_title = QLabel("録画を選んでください")
        self.recording_title.setObjectName("recordingTitle")
        video_header.addWidget(self.recording_title)
        video_header.addStretch()
        navigation = QHBoxLayout()
        self.previous_button = QPushButton("")
        self.previous_button.setObjectName("iconAction")
        self.previous_button.setIcon(icon("arrow-up", size=20))
        self.previous_button.setToolTip("前の録画（↑・←）")
        self.previous_button.setFixedSize(34, 34)
        self.previous_button.clicked.connect(lambda: self.select_relative(-1))
        self.next_button = QPushButton("")
        self.next_button.setObjectName("iconAction")
        self.next_button.setIcon(icon("arrow-down", size=20))
        self.next_button.setToolTip("次の録画（↓・→）")
        self.next_button.setFixedSize(34, 34)
        self.next_button.clicked.connect(lambda: self.select_relative(1))
        navigation.addWidget(self.previous_button)
        navigation.addWidget(self.next_button)
        video_header.addLayout(navigation)
        right_layout.addLayout(video_header)
        self.preview = VideoPreview()
        right_layout.addWidget(self.preview, 1)
        actions = QHBoxLayout()
        confirmation = QVBoxLayout()
        confirmation.setSpacing(5)
        self.review_title = QLabel("提供する録画を確認してください")
        self.review_title.setObjectName("approvalTitle")
        confirmation.addWidget(self.review_title)
        self.review_guide = QLabel(REVIEW_GUIDE)
        self.review_guide.setObjectName("reviewGuide")
        self.review_guide.setWordWrap(True)
        confirmation.addWidget(self.review_guide)
        actions.addLayout(confirmation, 1)
        actions.addStretch()
        self.discard_button = QPushButton("")
        self.discard_button.setObjectName("iconAction")
        self.discard_button.setIcon(icon("trash", size=20))
        self.discard_button.setToolTip("この録画を削除")
        self.discard_button.setFixedSize(40, 40)
        self.discard_button.setIconSize(QSize(20, 20))
        self.discard_button.clicked.connect(self.confirm_discard)
        actions.addWidget(self.discard_button, 0, Qt.AlignmentFlag.AlignVCenter)
        self.upload_button = QPushButton("提供を承認")
        self.upload_button.setObjectName("upload")
        self.upload_button.clicked.connect(self.start_upload)
        actions.addWidget(self.upload_button, 0, Qt.AlignmentFlag.AlignVCenter)
        right_layout.addLayout(actions)
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
        secondary = QHBoxLayout()
        self.cancel_upload_button = QPushButton("キャンセル")
        self.cancel_upload_button.clicked.connect(self.cancel_upload)
        self.cancel_upload_button.setVisible(False)
        self.approval_browser_button = QPushButton("承認画面を表示")
        self.approval_browser_button.clicked.connect(self.show_approval_browser)
        self.approval_browser_button.setVisible(False)
        self.folder_button = QAction("録画フォルダを表示", self)
        self.folder_button.triggered.connect(self.show_recording_folder)
        self.drive_button = QAction("Driveを開く", self)
        self.drive_button.triggered.connect(self.open_drive)
        secondary.addWidget(self.cancel_upload_button)
        secondary.addWidget(self.approval_browser_button)
        secondary.addStretch()
        right_layout.addLayout(secondary)
        splitter.addWidget(right)
        left.setMinimumWidth(240)
        right.setMinimumWidth(600)
        splitter.setSizes([260, 920])
        splitter.setChildrenCollapsible(False)
        layout.addWidget(splitter, 1)
        self.setCentralWidget(page)
        for key, offset in (("Up", -1), ("Left", -1), ("Down", 1), ("Right", 1)):
            shortcut = QShortcut(QKeySequence(key), self)
            shortcut.activated.connect(lambda step=offset: self.select_relative(step))
        self._update_controls()

    def set_profile(self, profile):
        if self.busy:
            raise ImportFailure("現在の作業が終わってから事業所を変更してください。")
        if self.workspace is not None and self.profile is not None and self.profile.site_id != profile.site_id:
            self.preview.clear()
            self.data_root = self.workspace.reset()
        directory = recordings_directory(profile.site_id, self.data_root)
        self.preview.clear()
        self.profile = profile
        self.device_transport = None
        self.device_root = None
        self.device_connected = False
        self.connection_timer.stop()
        self._set_connection_status("disconnected")
        self.recordings_root = directory
        self.progress_states.clear()
        self.device_sources.clear()
        self.uploaded_unit_ids.clear()
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
        self.site_label.setIcon(icon("chevron-down", size=16))
        self.status_label.setText("スマートグラスをUSB-Cでつなぎ、端末を再確認してください。")
        self.status_label.hide()
        self.refresh_recordings()
        self._update_controls()

    def switch_profile(self, profile):
        if self.profile and self.profile.site_id == profile.site_id:
            return
        if not self._screen_state().can_switch_site:
            return
        reconnect = self.device_connected or self.job_kind == "import"
        if self.busy:
            self.pending_profile = profile
            self.reconnect_after_switch = reconnect
            if self.job_kind == "import":
                self.cancel_event.set()
                self.status_label.setText("取り込みを中止し、事業所を切り替えています…")
            else:
                self.status_label.setText("現在の操作が終わり次第、事業所を切り替えます。")
            return
        self.set_profile(profile)
        if reconnect:
            self.start_import()

    def _complete_site_switch(self):
        if self.pending_profile is None or self.busy or self.closing:
            return
        profile, reconnect = self.pending_profile, self.reconnect_after_switch
        self.pending_profile = None
        self.reconnect_after_switch = False
        self.set_profile(profile)
        if reconnect:
            self.start_import()

    def show_site_menu(self):
        if self.profile is None:
            self.start_login()
            return
        menu = QMenu(self)
        menu.setStyleSheet("QMenu { background: #ffffff; border: 1px solid #deded9; padding: 8px; } "
                           "QMenu::item { padding: 9px 24px; } QMenu::item:selected { background: #f3f5ec; }")
        account_text = (f"SMSアカウント · 末尾{self.account_last4}"
                        if self.account_last4 else "SMSアカウントでログイン中")
        account_action = menu.addAction(account_text)
        account_action.setEnabled(False)
        menu.addSeparator()
        for site in self.sites:
            action = menu.addAction(site["name"])
            if site["id"] == self.profile.site_id:
                action.setCheckable(True)
                action.setChecked(True)
                action.setEnabled(False)
            else:
                action.triggered.connect(lambda checked=False, row=site: self.switch_profile(
                    SiteProfile(row["id"], row["name"], self.account.api_origin)))
        menu.addSeparator()
        logout_action = menu.addAction(icon("log-out", size=18),
                                       "ログアウト")
        logout_action.triggered.connect(self.logout)
        menu.addSeparator()
        menu.addAction(self.folder_button)
        menu.addAction(self.drive_button)
        menu.exec(self.site_label.mapToGlobal(self.site_label.rect().bottomLeft()))

    def _set_connection_status(self, state):
        if state == "connected":
            self.connection_label.setText("接続済み")
            status_icon = icon("circle-check", "#27613f", 16)
            background, foreground = "#e7f3df", "#27613f"
        elif state == "checking":
            self.connection_label.setText("確認中")
            status_icon = icon("loader-circle", "#78591c", 16)
            background, foreground = "#fff2d6", "#78591c"
        else:
            self.connection_label.setText("未接続")
            status_icon = icon("circle-x", "#6d6d68", 16)
            background, foreground = "#f1f1ef", "#6d6d68"
        self.connection_icon.setPixmap(status_icon.pixmap(16, 16))
        self.connection_box.setStyleSheet(
            f"QWidget#connectionStatus {{ border-radius: 12px; background: {background}; }} "
            f"QWidget#connectionStatus QLabel {{ background: transparent; border: 0; padding: 0; "
            f"color: {foreground}; font-size: 12px; font-weight: 600; }}")

    def start_login(self):
        if self.busy or self.closing:
            return
        self.busy = True
        self.job_kind = "login"
        self.cancel_event.clear()
        self.status_label.setText("RootLensへのログイン画面を開いています…")
        self.progress.setVisible(True)
        self._update_controls()

        def run():
            try:
                result = self.account.login(self._open_browser, self.cancel_event)
                self.signals.login_done.emit(result, "")
            except Exception as error:
                self.signals.login_done.emit(None, str(error))
        self.worker = threading.Thread(target=run, name="rootlens-login", daemon=True)
        self.worker.start()

    def restore_session(self):
        if self.busy or self.closing:
            return
        try:
            if not self.account.store.load():
                return
        except ImportFailure as error:
            self.status_label.setText(str(error))
            return
        self.busy = True
        self.job_kind = "restore"
        self.status_label.setText("前回のログインを確認しています…")
        self.progress.setVisible(True)
        self._update_controls()

        def run():
            try:
                self.signals.login_done.emit(self.account.current(), "")
            except ImportFailure as error:
                self.signals.login_done.emit(None, str(error))
        self.worker = threading.Thread(target=run, name="rootlens-restore-session", daemon=True)
        self.worker.start()

    def _open_browser(self, url):
        completed = threading.Event()
        result = {}
        self.signals.browser_requested.emit(url, completed, result)
        while not completed.wait(0.1):
            if self.closing:
                return False
        return result.get("opened", False)

    @Slot(str, object, object)
    def _show_browser(self, url, completed, result):
        try:
            if self.closing:
                result["opened"] = False
                return
            if self.browser is None:
                from .browser import RootLensBrowser
                self.browser = RootLensBrowser(self.account.api_origin,
                                               self.profile_path.with_name("browser"), self)
                self.browser.rejected.connect(self._browser_rejected)
            result["opened"] = self.browser.open_url(url)
            self._update_controls()
        except Exception:
            result["opened"] = False
        finally:
            completed.set()

    def _browser_rejected(self):
        if self.job_kind == "login":
            self.cancel_event.set()
        elif self.approval_pending:
            self.status_label.setText("承認画面を閉じました。続けるには「承認画面を表示」を押してください。")
            self._update_controls()

    def show_approval_browser(self):
        if self.approval_pending and self.browser is not None:
            self.browser.show()
            self.browser.raise_()
            self.browser.activateWindow()
            self._update_controls()

    @Slot()
    def _approval_complete(self):
        self.approval_pending = False
        if self.browser is not None:
            self.browser.dismiss()
        self._update_controls()

    @Slot(object, str)
    def _login_finished(self, result, error):
        if self.browser is not None:
            self.browser.dismiss()
        self.busy = False
        self.job_kind = None
        self.worker = None
        self.progress.setVisible(False)
        if error:
            self.status_label.setText(error)
            self._update_controls()
            return
        if result is None:
            self.status_label.setText("画面上部の「SMSでログイン」を押してください。")
            self._update_controls()
            return
        sites = result["sites"]
        self.sites = sites
        self.account_last4 = result.get("phoneLast4")
        selected = next((site for site in sites if self.profile and site["id"] == self.profile.site_id), sites[0])
        profile = SiteProfile(selected["id"], selected["name"], self.account.api_origin)
        self.set_profile(profile)

    def logout(self):
        if self.busy:
            return
        error = ""
        try:
            self.account.logout()
        except ImportFailure as failure:
            error = str(failure)
        if self.browser is None:
            from .browser import forget_browser_session
            forget_browser_session(self.profile_path.with_name("browser"))
        else:
            self.browser.clear_session()
        self.preview.clear()
        if self.workspace is not None:
            self.data_root = self.workspace.reset()
        self.profile = None
        self.sites = []
        self.account_last4 = None
        self.device_transport = None
        self.device_root = None
        self.device_connected = False
        self.connection_timer.stop()
        self._set_connection_status("disconnected")
        self.recordings_root = None
        self.records = []
        self.all_records = []
        self.progress_states.clear()
        self.device_sources.clear()
        self.uploaded_unit_ids.clear()
        self.recording_names.clear()
        self.blocked_names.clear()
        self.upload_states.clear()
        self.refresh_recordings(rescan=False)
        self.site_label.setText("SMSでログイン")
        self.site_label.setIcon(QIcon())
        self.status_label.setText(error or "ログアウトしました。画面上部の「SMSでログイン」から再ログインしてください。")
        self._update_controls()

    def selected_recording(self):
        item = self.recording_list.currentItem()
        path = item.data(0, Qt.ItemDataRole.UserRole) if item else None
        for record in self.records:
            name = self._recording_name(record)
            progress = self.progress_states.get(name)
            if (str(record.path) == path and name not in self.blocked_names
                    and (progress is None or progress.state == "ready")):
                return record
        return None

    def selected_problem(self):
        item = self.recording_list.currentItem()
        name = item.data(0, Qt.ItemDataRole.UserRole + 2) if item else None
        progress = self.progress_states.get(name)
        return progress if progress and progress.state in ("error", "incomplete", "cleanup_pending") else None

    def _recording_name(self, record):
        source = self.device_sources.get(record.unit_id)
        return self.recording_names.get(record.unit_id, getattr(source, "name", record.unit_id))

    def refresh_recordings(self, rescan=True):
        selected = self.selected_recording()
        selected_path = selected.path if selected else None
        selected_problem = self.selected_problem()
        selected_problem_name = selected_problem.name if selected_problem else None
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
            state = PROGRESS_LABELS.get(progress.state, "端末の確認待ち") if progress else "端末の確認待ち"
            loading = ((progress is not None and progress.state not in SELECTABLE_STATES)
                       or (self.upload_running and self.upload_record is not None
                           and self.upload_record.unit_id == record.unit_id))
            display_time = recording_time_label(record.created_text)
            item = QTreeWidgetItem([f"{display_time}\n{record.duration_text}", state])
            item.setData(0, Qt.ItemDataRole.UserRole, str(record.path))
            chip = ("•••" if loading else
                    "取り込みエラー" if remote_name in self.blocked_names else "承認待ち")
            item.setData(0, Qt.ItemDataRole.UserRole + 1, chip)
            item.setData(0, Qt.ItemDataRole.UserRole + 3, loading)
            item.setToolTip(0, record.created_text)
            if remote_name in self.blocked_names:
                item.setData(0, Qt.ItemDataRole.UserRole + 2, remote_name)
                item.setText(1, "取り込みエラー")
            if loading:
                item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsSelectable)
            if progress and progress.state == "ready":
                item.setToolTip(1, "内容を確認し、問題なければ「提供を承認」を押してください。")
            if progress and progress.error:
                item.setToolTip(1, progress.error)
            if record.unit_id in self.upload_states and remote_name not in self.blocked_names:
                item.setToolTip(1, self.upload_states[record.unit_id])
            self.recording_list.addTopLevelItem(item)
            if record.path == selected_path:
                selected_item = item
        for name, progress in self.progress_states.items():
            if name in ready_names or progress.state in ("drive_saved", "local_cleanup_pending"):
                continue
            label = PROGRESS_LABELS.get(progress.state, "端末の確認待ち")
            loading = progress.state not in SELECTABLE_STATES
            chip = ("•••" if loading else
                    "保存未完了" if progress.state == "incomplete" else
                    "削除待ち" if progress.state == "cleanup_pending" else "取り込みエラー")
            item = QTreeWidgetItem([f"{problem_time_label(name)}\n{'処理中' if loading else label}", label])
            item.setData(0, Qt.ItemDataRole.UserRole + 1, chip)
            item.setData(0, Qt.ItemDataRole.UserRole + 3, loading)
            if not loading:
                item.setData(0, Qt.ItemDataRole.UserRole + 2, name)
            else:
                item.setFlags(item.flags() & ~Qt.ItemFlag.ItemIsSelectable)
            guidance = ("グラス側で録画の保存が完了していません。端末から削除できます。"
                        if progress.state == "incomplete" else
                        "Driveへの保存内容を再確認した上で、端末から削除できます。再アップロードは不要です。"
                        if progress.state == "cleanup_pending" else progress.error)
            item.setToolTip(0, guidance)
            item.setToolTip(1, guidance)
            self.recording_list.addTopLevelItem(item)
            if name == selected_problem_name:
                selected_item = item
        if selected_item is None:
            selected_item = next((self.recording_list.topLevelItem(index)
                                  for index in range(self.recording_list.topLevelItemCount())
                                  if self.recording_list.topLevelItem(index).flags() & Qt.ItemFlag.ItemIsSelectable), None)
        self.recording_list.setCurrentItem(selected_item)
        self.recording_list.verticalScrollBar().setValue(scroll_value)
        self.recording_list.blockSignals(False)
        has_loading = any(self.recording_list.topLevelItem(index).data(0, Qt.ItemDataRole.UserRole + 3)
                          for index in range(self.recording_list.topLevelItemCount()))
        if has_loading and not self.loading_timer.isActive():
            self.loading_timer.start()
        elif not has_loading:
            self.loading_timer.stop()
        self.count_label.setText(f"撮影データ {self.recording_list.topLevelItemCount()} 件"
                                 if self.drive_synced else "撮影データ")
        self._selection_changed()

    def _animate_loading(self):
        self.loading_phase = (self.loading_phase + 1) % 3
        dots = "•" * (self.loading_phase + 1)
        for index in range(self.recording_list.topLevelItemCount()):
            item = self.recording_list.topLevelItem(index)
            if item.data(0, Qt.ItemDataRole.UserRole + 3):
                item.setData(0, Qt.ItemDataRole.UserRole + 1, dots)

    def _selection_changed(self, *_):
        record = self.selected_recording()
        if record:
            self.recording_title.setText(recording_time_label(record.created_text))
            self.preview.load(record.path / "rgb.mp4", autoplay=True)
            self.review_title.setText("提供する録画を確認してください")
            self.review_guide.setText(REVIEW_GUIDE)
        elif problem := self.selected_problem():
            self.recording_title.setText(problem_time_label(problem.name))
            self.preview.clear()
            saved = problem.state == "cleanup_pending"
            self.preview.empty.setText("Driveへの保存は完了しています。\n端末に残るデータを削除できます。" if saved else
                                       "この録画は取り込みできていません。\n端末から削除できます。")
            self.review_title.setText("端末に残るデータを削除できます")
            self.review_guide.setText(
                ("Driveへの保存内容を確認してから端末のデータを削除します。"
                 + (" " + problem.error if problem.error else "")) if saved else
                "この録画は提供を承認できません。不要であれば端末から削除してください。")
        else:
            self.recording_title.setText("録画を選んでください")
            self.preview.clear()
            self.preview.empty.setText("録画を選ぶと、ここで再生できます。")
            self.review_title.setText("提供する録画を確認してください")
            self.review_guide.setText(REVIEW_GUIDE)
        self._update_controls()

    def select_relative(self, offset):
        current = self.recording_list.currentItem()
        if current is None:
            return
        index = self.recording_list.indexOfTopLevelItem(current) + offset
        while 0 <= index < self.recording_list.topLevelItemCount():
            item = self.recording_list.topLevelItem(index)
            if item.flags() & Qt.ItemFlag.ItemIsSelectable:
                self.recording_list.setCurrentItem(item)
                return
            index += offset

    def _update_controls(self):
        if not hasattr(self, "recording_list"):
            return
        record = self.selected_recording()
        state = self._screen_state()
        self.connect_button.setEnabled(state.can_connect)
        self.settings_button.setEnabled(state.can_switch_site or state.phase == Phase.SIGNED_OUT)
        self.folder_button.setEnabled(record is not None and state.phase != Phase.CLOSING)
        self.drive_button.setEnabled(self.profile is not None and state.phase != Phase.CLOSING)
        self.upload_button.setEnabled(state.can_approve)
        self.discard_button.setEnabled(state.can_delete)
        self.upload_button.setToolTip(self.completion_error if self.completion_error else
                                     ("" if self.profile else "画面上部の「SMSでログイン」からログインしてください。"))
        self.cancel_upload_button.setVisible(self.upload_running)
        self.cancel_upload_button.setEnabled(self.upload_running and not self.upload_cancel_event.is_set())
        self.approval_browser_button.setVisible(
            self.approval_pending and self.browser is not None and not self.browser.isVisible())
        allowed = [i for i in range(self.recording_list.topLevelItemCount())
                   if self.recording_list.topLevelItem(i).flags() & Qt.ItemFlag.ItemIsSelectable]
        index = self.recording_list.indexOfTopLevelItem(self.recording_list.currentItem()) if self.recording_list.currentItem() else -1
        self.previous_button.setEnabled(index >= 0 and any(i < index for i in allowed))
        self.next_button.setEnabled(index >= 0 and any(i > index for i in allowed))

    def _screen_state(self):
        record = self.selected_recording()
        problem = self.selected_problem()
        selection = "ready" if record else "problem" if problem else "none"
        return ScreenState(
            screen_phase(profile=self.profile, job=self.job_kind,
                         connected=self.device_connected, uploading=self.upload_running,
                         switching=self.pending_profile is not None,
                         deleting=self.pending_discard is not None, closing=self.closing),
            selection=selection,
            source_available=bool(record and record.unit_id in self.device_sources),
            problem_accessible=bool(problem and self.device_transport and self.device_root
                                    and (problem.state != "cleanup_pending" or problem.unit_id)),
            drive_ready=not self.completion_error,
        )

    def start_import(self):
        if not self._screen_state().can_connect:
            return
        self.busy = True
        self.device_connected = False
        self.device_transport = None
        self.device_root = None
        self.connection_timer.stop()
        self._set_connection_status("checking")
        self.device_sources.clear()
        self.uploaded_unit_ids.clear()
        self.recording_names.clear()
        self.job_kind = "import"
        self.cancel_event.clear()
        self.progress_states.clear()
        self.all_records.clear()
        self.drive_synced = False
        self.completion_error = ""
        self.refresh_recordings(rescan=False)
        self.progress.setRange(0, 0)
        self.progress.setVisible(True)
        self.status_label.setText("USB接続を確認しています…")
        self._update_controls()
        directory = self.recordings_root
        profile = self.profile

        def run():
            try:
                summary = self.importer(output=directory, log=self.signals.log.emit,
                                        cancel_event=self.cancel_event, on_clip=self.signals.clip.emit,
                                        on_source=self.signals.source.emit,
                                        on_device=self.signals.device.emit,
                                        site_id=profile.site_id,
                                        drive_reader=lambda unit_ids: self.drive_reader(
                                            profile, unit_ids, self.cancel_event, self.gateway_factory(profile)),
                                        on_drive_checked=lambda recordings, error: self.signals.drive_checked.emit(recordings, error))
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
        if self.job_kind != "import" or not self.progress_states:
            self.status_label.setText(text)

    @Slot(object)
    def _clip_progress(self, progress):
        selected = self.selected_recording()
        self.progress_states[progress.name] = progress
        if progress.total and self.busy and self.job_kind == "import":
            self.progress.setRange(0, progress.total)
            complete = progress.state in ("ready", "drive_saved", "cleanup_pending", "error")
            self.progress.setValue(progress.position if complete else progress.position - 1)
            self.status_label.setText(f"録画を確認中 {progress.position} / {progress.total}")
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

    @Slot(object)
    def _source_available(self, source):
        if source.unit_id not in self.uploaded_unit_ids:
            self.device_sources[source.unit_id] = source
            self.recording_names[source.unit_id] = source.name
            self.device_connected = True
            self._set_connection_status("connected")
            if isinstance(source.adb, Adb):
                self.device_transport = (str(source.adb.executable), source.adb.selector[1], source.serial)
                self.connection_timer.start()
            self._update_controls()

    @Slot(object, str)
    def _device_available(self, transport, root):
        if self.job_kind != "import" or self.closing:
            return
        self.device_transport = transport
        self.device_root = root
        self.device_connected = True
        self._set_connection_status("connected")
        self.connection_timer.start()
        self._update_controls()

    def _check_connection(self):
        transport = self.device_transport
        if transport is None or self.connection_check_running or self.closing:
            return
        self.connection_check_running = True

        def run():
            self.signals.connection_checked.emit(transport, probe_transport(transport))

        threading.Thread(target=run, name="rootlens-usb-check", daemon=True).start()

    @Slot(object, bool)
    def _connection_checked(self, transport, connected):
        self.connection_check_running = False
        if transport != self.device_transport or self.closing:
            return
        if connected:
            return
        self.connection_timer.stop()
        self.device_transport = None
        self.device_connected = False
        self.device_sources.clear()
        self._set_connection_status("disconnected")
        if self.upload_running and not self.upload_saved:
            self.upload_cancel_event.set()
        self._update_controls()
        self.status_label.setText("スマートグラスとの接続が切れました。USBケーブルを確認し、端末を再確認してください。")
        QMessageBox.warning(self, "端末との接続が切れました",
                            "スマートグラスを確認できません。承認と削除を停止しました。\n"
                            "USBケーブルをつなぎ直し、右上の更新ボタンで端末を再確認してください。")

    def _flush_progress(self):
        rescan = self._library_dirty
        self._library_dirty = False
        self.refresh_recordings(rescan=rescan)

    @Slot(object, str, bool)
    def _import_finished(self, summary, error, cancelled):
        self.busy = self.upload_running
        self.job_kind = None
        self.worker = None
        self._refresh_timer.stop()
        self._library_dirty = False
        self.progress.setVisible(False)
        if (error or cancelled) and self.pending_discard is None:
            self.progress_states.clear()
            self.drive_synced = False
            self.device_sources.clear()
            self.recording_names.clear()
            self.device_connected = False
            self.device_transport = None
            self.device_root = None
            self.connection_timer.stop()
            self._set_connection_status("disconnected")
        elif summary is not None:
            self.device_sources = {unit_id: source for unit_id, source in getattr(summary, "sources", {}).items()
                                   if unit_id not in self.uploaded_unit_ids}
            self.recording_names.update({unit_id: source.name for unit_id, source in self.device_sources.items()})
            self.device_transport = getattr(summary, "transport", None)
            self.device_root = getattr(summary, "device_root", None)
            self.device_connected = True
            self._set_connection_status("connected")
            if self.device_transport is not None:
                self.connection_timer.start()
        else:
            self.device_connected = self.device_transport is not None
            self._set_connection_status("connected" if self.device_connected else "disconnected")
        self.refresh_recordings()
        if self.closing:
            self.close()
            return
        if error:
            self.status_label.setText(f"録画を取り込めませんでした。\n{error}")
        elif cancelled:
            self.status_label.setText("確認を中止しました。もう一度「端末を再確認」を押してください。")
        else:
            parts = [f"新しく取り込んだ録画 {summary.imported} 件" if summary.imported else "録画の確認が終わりました。"]
            if summary.incomplete:
                parts.append(f"保存未完了 {summary.incomplete} 件。不要な録画は選んで削除できます。")
            if summary.failed:
                parts.append(f"取り込みエラー {summary.failed} 件")
            if getattr(summary, "cleanup_pending", 0):
                parts.append("削除待ちの録画があります。対象を選ぶと理由を確認できます。")
            if getattr(summary, "local_cleanup_pending", 0):
                parts.append("PCのコピーを削除できなかった録画があります。保存先を確認してください。")
            if getattr(summary, "discard_pending", 0):
                parts.append("削除が終わっていない録画があります。端末を再確認してください。")
            if self.completion_error:
                parts.append(self.completion_error)
            self.status_label.setText(" ／ ".join(parts))
            if len(parts) == 1:
                self.status_label.hide()
        self._update_controls()
        if self.pending_discard is not None:
            selected = self.pending_discard
            self.pending_discard = None
            self._perform_discard(*selected)
            return
        self._complete_site_switch()

    def confirm_discard(self):
        record = self.selected_recording()
        problem = self.selected_problem()
        if not self._screen_state().can_delete:
            return
        saved = problem is not None and problem.state == "cleanup_pending"
        question = ("Driveへの保存内容を確認して、端末に残るデータを削除しますか？\nDrive上のデータは残ります。"
                    if saved else "この録画をスマートグラスとPCから削除しますか？\n削除した録画は元に戻せません。")
        answer = QMessageBox.question(
            self, "録画を削除", question,
            QMessageBox.StandardButton.Cancel | QMessageBox.StandardButton.Yes,
            QMessageBox.StandardButton.Cancel,
        )
        if answer != QMessageBox.StandardButton.Yes:
            return
        if self.busy and self.job_kind == "import":
            self.pending_discard = (record, problem)
            self.cancel_event.set()
            self.status_label.setText("取り込みを止めて、選んだ録画を削除します…")
            self._update_controls()
            return
        self._perform_discard(record, problem)

    def _perform_discard(self, record, problem):
        saved = problem is not None and problem.state == "cleanup_pending"
        self.preview.clear()
        self.busy = True
        self.job_kind = "discard"
        self.cancel_event.clear()
        self.progress.setRange(0, 0)
        self.progress.show()
        self.status_label.setText("端末上の録画を確認して削除しています…")
        self._update_controls()
        source = self.device_sources.get(record.unit_id) if record else None
        transport = self.device_transport
        device_root = self.device_root
        profile = self.profile

        def run():
            device_deleted = False
            try:
                if transport and not probe_transport(transport):
                    self.signals.connection_checked.emit(transport, False)
                    raise ImportFailure("スマートグラスとの接続が切れました。端末を再確認してください。")
                if saved:
                    delete_saved_capture(
                        transport, device_root, problem.name, problem.unit_id,
                        lambda unit_ids: self.drive_reader(
                            profile, unit_ids, self.cancel_event, self.gateway_factory(profile)),
                        self.cancel_event, log=self.signals.log.emit)
                elif problem:
                    discard_problem_capture(transport, device_root, problem.name, self.cancel_event)
                else:
                    discard_unapproved_recording(source, record.path, self.cancel_event)
                device_deleted = True
                if record:
                    remove_uploaded_local_copy(self.recordings_root, record.unit_id)
                elif problem.path is not None or saved:
                    remove_uploaded_local_copy(self.recordings_root,
                                               problem.unit_id if saved else problem.path.name)
                error = ""
            except (ImportFailure, OSError) as failure:
                error = str(failure)
            except Exception:
                error = "録画を削除できませんでした。端末を再確認してください。"
            self.signals.discard_done.emit(record or problem, error, device_deleted)

        self.worker = threading.Thread(target=run, name="rootlens-discard-recording", daemon=True)
        self.worker.start()

    @Slot(object, str, bool)
    def _discard_finished(self, selected, error, device_deleted):
        self.busy = False
        self.job_kind = None
        self.worker = None
        self.progress.hide()
        if device_deleted:
            name = selected.name if isinstance(selected, ClipProgress) else self._recording_name(selected)
            if not isinstance(selected, ClipProgress):
                self.device_sources.pop(selected.unit_id, None)
                self.recording_names.pop(selected.unit_id, None)
                self.upload_states.pop(selected.unit_id, None)
            self.progress_states.pop(name, None)
            self.preview.clear()
            self.refresh_recordings()
        self.status_label.setText(
            ("端末からは削除しました。PCの確認用コピーを削除できませんでした。" if device_deleted else error)
            if error else "録画を削除しました。")
        self._update_controls()
        if self.closing:
            self.close()
        else:
            self._complete_site_switch()

    def start_upload(self):
        record = self.selected_recording()
        if not self._screen_state().can_approve:
            return
        try:
            read_recording(record.path)
        except (ImportFailure, OSError, ValueError) as error:
            self.refresh_recordings()
            self.status_label.setText(str(error))
            return
        self.upload_running = True
        self.approval_pending = True
        if not self.busy:
            self.busy = True
            self.job_kind = "upload"
        self.upload_record = record
        self.upload_saved = False
        self.upload_cancel_event.clear()
        self.upload_states[record.unit_id] = "承認待ち"
        self.upload_status_label.setText(f"{record.created_text} — アプリ内で提供を承認してください。")
        self.upload_status_label.setVisible(True)
        self.upload_progress_bar.setRange(0, 0)
        self.upload_progress_bar.setVisible(True)
        self.status_label.setText("この録画の提供を承認してください。")
        self._update_controls()
        self.refresh_recordings(rescan=False)
        profile = self.profile
        source = self.device_sources.get(record.unit_id)
        transport = self.device_transport

        def run():
            uploader = None
            result, error, cancelled, cleanup_error = None, "", False, ""
            try:
                if transport and not probe_transport(transport):
                    self.signals.connection_checked.emit(transport, False)
                    raise ImportFailure("スマートグラスとの接続が切れました。端末を再確認してください。")
                gateway = self.gateway_factory(profile)
                approval_event_id = self.approver(
                    record.path, gateway, cancel_event=self.upload_cancel_event, open_browser=self._open_browser,
                )
                self.signals.approval_done.emit()
                uploader = self.uploader_factory(profile, gateway=gateway,
                                                state_dir=self.data_root / "uploads")
                result = uploader.upload_recording(record.path, approval_event_id,
                                                   on_progress=self.signals.upload_progress.emit,
                                                   cancel_event=self.upload_cancel_event)
                if isinstance(result, UploadResult) and result.unit_id == record.unit_id:
                    self.signals.upload_progress.emit(UploadProgress(record.unit_id, "cleaning_device",
                                                      result.total_bytes, result.total_bytes))
                    self.signals.log.emit("保存を確認しました。スマートグラスから録画を削除しています…")
                    try:
                        self.cleaner(source, drive_reader=lambda unit_ids: self.drive_reader(
                            profile, unit_ids, self.upload_cancel_event, self.gateway_factory(profile)),
                                     log=self.signals.log.emit, cancel_event=self.upload_cancel_event)
                    except (ImportFailure, OSError):
                        cleanup_error = "アップロードは完了しました。端末からの削除は、次の接続で再試行します。"
                    except Exception:
                        cleanup_error = "アップロードは完了しました。端末から削除できなかったため、もう一度「端末を再確認」を押してください。"
            except ImportCancelled:
                cancelled = True
            except ImportFailure as failure:
                error = str(failure)
            except Exception:
                # Unexpected HTTP/library errors can contain request headers or credential details.
                error = "アップロードできませんでした。インターネット接続を確認し、もう一度「提供を承認」を押してください。"
            finally:
                if uploader is not None:
                    try:
                        uploader.close()
                    except Exception:
                        pass
            self.signals.upload_done.emit(result, error, cancelled, cleanup_error)
        self.upload_worker = threading.Thread(target=run, name="rootlens-drive-upload", daemon=True)
        self.upload_worker.start()

    @Slot(object)
    def _upload_progress(self, progress):
        if (not self.upload_running or self.upload_record is None
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
        if self.upload_running:
            self.upload_cancel_event.set()
            self.upload_status_label.setText("端末からの削除を中止しています…" if self.upload_saved
                                             else "アップロードを中止しています…")
            self._update_controls()

    @Slot(object, str, bool, str)
    def _upload_finished(self, result, error, cancelled, cleanup_error=""):
        self.approval_pending = False
        if self.browser is not None:
            self.browser.dismiss()
        record = self.upload_record
        self.upload_running = False
        self.upload_worker = None
        if self.job_kind == "upload":
            self.job_kind = None
        self.busy = self.job_kind is not None
        self.upload_record = None
        self._refresh_timer.stop()
        self.upload_progress_bar.setVisible(False)
        verified = (record is not None and isinstance(result, UploadResult)
                    and result.unit_id == record.unit_id and not error and not cancelled)
        if verified:
            name = self._recording_name(record)
            self.uploaded_unit_ids.add(record.unit_id)
            device_cleanup_error = bool(cleanup_error)
            self.device_sources.pop(record.unit_id, None)
            self.recording_names.pop(record.unit_id, None)
            if self.preview.path == record.path / "rgb.mp4":
                self.preview.clear()
            local_cleanup_error = False
            try:
                remove_uploaded_local_copy(self.recordings_root, record.unit_id)
            except (ImportFailure, OSError):
                local_cleanup_error = True
                cleanup_error = (cleanup_error + " " if cleanup_error else "") + "PCのコピーを削除できませんでした。次の接続時に再確認します。"
            self.progress_states[name] = ClipProgress(name, None,
                "cleanup_pending" if device_cleanup_error else
                "local_cleanup_pending" if local_cleanup_error else "drive_saved", cleanup_error,
                unit_id=record.unit_id)
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
            text = "アップロードを中止しました。同じ録画を選んで「提供を承認」を押すと再開できます。"
        else:
            self.upload_states[record.unit_id] = "再度アップロードできます"
            text = error or self.completion_error or "アップロードの完了を確認できませんでした。もう一度「提供を承認」を押してください。"
        self.status_label.setText(text)
        self.upload_status_label.setText(text)
        self.upload_status_label.setVisible(not verified or bool(cleanup_error))
        if verified and not cleanup_error:
            self.status_label.hide()
        self.refresh_recordings(rescan=False)
        self._update_controls()
        self._complete_site_switch()

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
            self.upload_cancel_event.set()
            self.status_label.setText("現在の作業を中止して閉じています…")
            self._update_controls()
            event.ignore()
            return
        self.preview.clear()
        self._refresh_timer.stop()
        self.connection_timer.stop()
        if self.browser is not None:
            self.browser.shutdown()
            self.browser = None
        self.account.close()
        if self.workspace is not None:
            self.workspace.close()
        event.accept()


def main():
    application = QApplication.instance() or QApplication(sys.argv)
    application.setApplicationName(APP_NAME)
    application.setOrganizationName("RootLens")
    application.setWindowIcon(app_icon())
    for legacy in (settings_path(), settings_path().with_name("session.json")):
        try:
            legacy.unlink(missing_ok=True)
        except OSError as error:
            raise ImportFailure("以前のログイン設定を削除できません。保存先を確認してください。") from error
    window = ImportWindow()
    window.show()
    return application.exec()


if __name__ == "__main__":
    sys.exit(main())
