"""Local video and audio playback with one bounded media-player lifetime."""

from pathlib import Path

from PySide6.QtCore import Qt, QUrl
from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer
from PySide6.QtMultimediaWidgets import QVideoWidget
from PySide6.QtWidgets import QHBoxLayout, QLabel, QPushButton, QSlider, QStackedWidget, QVBoxLayout, QWidget

from .core import is_link


def time_text(milliseconds):
    seconds = max(0, int(milliseconds)) // 1000
    if seconds >= 3600:
        return f"{seconds // 3600}:{seconds // 60 % 60:02d}:{seconds % 60:02d}"
    return f"{seconds // 60:02d}:{seconds % 60:02d}"


class VideoPreview(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.path = None
        self.player = QMediaPlayer(self)
        self.audio = QAudioOutput(self)
        self.audio.setVolume(0.7)
        self.player.setAudioOutput(self.audio)
        self.video = QVideoWidget(self)
        self.video.setMinimumSize(320, 200)
        self.video.setAspectRatioMode(Qt.AspectRatioMode.KeepAspectRatio)
        self.video.setStyleSheet("background: #161b19;")
        self.player.setVideoOutput(self.video)
        self.empty = QLabel("録画を選ぶと、ここで再生できます。")
        self.empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.empty.setStyleSheet("background: #161b19; color: #dce5dd; border-radius: 6px;")
        self.display = QStackedWidget()
        self.display.setMinimumSize(320, 200)
        self.display.setStyleSheet("background: #161b19;")
        self.display.addWidget(self.empty)
        self.display.addWidget(self.video)
        self.message = QLabel("左の一覧から録画を選んでください。")
        self.message.setObjectName("muted")
        self.message.setWordWrap(True)
        self.play_button = QPushButton("再生")
        self.play_button.setFixedWidth(88)
        self.play_button.clicked.connect(self.toggle_playback)
        self.timeline = QSlider(Qt.Orientation.Horizontal)
        self.timeline.setRange(0, 0)
        self.timeline.sliderMoved.connect(self.player.setPosition)
        self.timeline.sliderReleased.connect(lambda: self.player.setPosition(self.timeline.value()))
        self.clock = QLabel("00:00 / 00:00")
        self.clock.setMinimumWidth(112)
        self.clock.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        self.mute_button = QPushButton("消音")
        self.mute_button.setCheckable(True)
        self.mute_button.setFixedWidth(64)
        self.mute_button.toggled.connect(self.audio.setMuted)
        controls = QHBoxLayout()
        controls.setSpacing(10)
        for widget in (self.play_button, self.timeline, self.clock, self.mute_button):
            controls.addWidget(widget, 1 if widget is self.timeline else 0)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)
        layout.addWidget(self.display, 1)
        layout.addWidget(self.message)
        layout.addLayout(controls)
        self.player.positionChanged.connect(self._position_changed)
        self.player.durationChanged.connect(self._duration_changed)
        self.player.seekableChanged.connect(self._seekable_changed)
        self.player.playbackStateChanged.connect(self._playback_changed)
        self.player.errorOccurred.connect(self._error)
        self.player.mediaStatusChanged.connect(self._media_status_changed)
        self._enable(False)

    def _enable(self, enabled):
        self.play_button.setEnabled(enabled)
        self.mute_button.setEnabled(enabled)
        self.timeline.setEnabled(enabled and self.player.isSeekable())

    def load(self, path):
        path = Path(path)
        if is_link(path) or not path.is_file():
            self.clear()
            self.message.setText("映像が見つかりません。スマートグラスをつなぎ直し、もう一度「接続」を押してください。")
            return
        if path == self.path:
            return
        self.player.stop()
        self.path = path
        self.display.setCurrentWidget(self.video)
        self.message.setText("再生すると映像と音声を確認できます。")
        self.timeline.setRange(0, 0)
        self.clock.setText("00:00 / 00:00")
        self.player.setSource(QUrl.fromLocalFile(str(path)))
        self._enable(True)

    def clear(self):
        self.player.stop()
        self.player.setSource(QUrl())
        self.path = None
        self.display.setCurrentWidget(self.empty)
        self.timeline.setRange(0, 0)
        self.clock.setText("00:00 / 00:00")
        self.message.setText("左の一覧から録画を選んでください。")
        self._enable(False)

    def toggle_playback(self):
        if self.path is None:
            return
        if self.player.playbackState() == QMediaPlayer.PlaybackState.PlayingState:
            self.player.pause()
        else:
            if self.player.mediaStatus() == QMediaPlayer.MediaStatus.EndOfMedia:
                self.player.setPosition(0)
            self.player.play()

    def _playback_changed(self, state):
        self.play_button.setText("一時停止" if state == QMediaPlayer.PlaybackState.PlayingState else "再生")

    def _position_changed(self, position):
        if not self.timeline.isSliderDown():
            self.timeline.setValue(position)
        self.clock.setText(f"{time_text(position)} / {time_text(self.player.duration())}")

    def _duration_changed(self, duration):
        self.timeline.setRange(0, max(0, duration))
        self._position_changed(self.player.position())

    def _seekable_changed(self, seekable):
        self.timeline.setEnabled(self.path is not None and seekable)

    def _media_status_changed(self, status):
        if status == QMediaPlayer.MediaStatus.LoadedMedia:
            self.message.setText("映像と音声を確認してください。")

    def _error(self, error, detail):
        if error != QMediaPlayer.Error.NoError:
            self.message.setText("この録画を再生できません。スマートグラスをつなぎ直して確認してください。解決しない場合は管理者に連絡してください。")
            self._enable(False)

    def close(self):
        self.clear()
        return super().close()
