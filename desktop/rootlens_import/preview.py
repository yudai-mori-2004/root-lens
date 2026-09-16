"""Local video and audio playback with one bounded media-player lifetime."""

from pathlib import Path

from PySide6.QtCore import Qt, QUrl
from PySide6.QtMultimedia import QAudioOutput, QMediaPlayer
from PySide6.QtMultimediaWidgets import QVideoWidget
from PySide6.QtWidgets import QHBoxLayout, QLabel, QPushButton, QSlider, QStackedWidget, QVBoxLayout, QWidget

from .core import is_link
from .icons import icon


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
        self.video.setStyleSheet("background: #171916;")
        self.player.setVideoOutput(self.video)
        self.empty = QLabel("録画を選ぶと、ここで再生できます。")
        self.empty.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.empty.setStyleSheet("background: #171916; color: #ffffff;")
        self.display = QStackedWidget()
        self.display.setMinimumSize(320, 200)
        self.display.setStyleSheet("background: #171916;")
        self.display.addWidget(self.empty)
        self.display.addWidget(self.video)
        self.message = QLabel("左の一覧から録画を選んでください。")
        self.message.setObjectName("muted")
        self.message.setWordWrap(True)
        self.message.setVisible(False)
        self.play_button = QPushButton()
        self.play_button.setIcon(icon("play", "#ffffff", 18))
        self.play_button.setObjectName("playbackToggle")
        self.play_button.setToolTip("再生・一時停止")
        self.play_button.setFixedWidth(30)
        self.play_button.clicked.connect(self.toggle_playback)
        self.timeline = QSlider(Qt.Orientation.Horizontal)
        self.timeline.setRange(0, 0)
        self.timeline.sliderMoved.connect(self.player.setPosition)
        self.timeline.sliderReleased.connect(lambda: self.player.setPosition(self.timeline.value()))
        self.clock = QLabel("00:00")
        self.clock.setMinimumWidth(42)
        self.duration_label = QLabel("00:00")
        self.duration_label.setMinimumWidth(42)
        self.duration_label.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
        self.mute_button = QPushButton("消音", self)
        self.mute_button.setCheckable(True)
        self.mute_button.toggled.connect(self.audio.setMuted)
        self.mute_button.hide()
        playback_bar = QWidget()
        playback_bar.setObjectName("playbackBar")
        playback_bar.setStyleSheet("""
            QWidget#playbackBar { background: #1b1f1c; }
            QWidget#playbackBar QLabel { background: transparent; color: #ffffff; font-size: 12px; }
            QPushButton#playbackToggle { background: transparent; color: #ffffff; border: 0;
                                        padding: 0; min-height: 0; font-size: 15px; }
            QSlider { background: transparent; border: 0; }
            QSlider::groove:horizontal { height: 3px; background: #6c736c; }
            QSlider::sub-page:horizontal { background: #e2ead6; }
            QSlider::handle:horizontal { width: 10px; margin: -4px 0; background: #e2ead6; }
        """)
        controls = QHBoxLayout(playback_bar)
        controls.setContentsMargins(15, 0, 15, 0)
        controls.setSpacing(9)
        controls.addWidget(self.play_button)
        controls.addWidget(self.clock)
        controls.addWidget(self.timeline, 1)
        controls.addWidget(self.duration_label)
        playback_bar.setFixedHeight(48)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        layout.addWidget(self.display, 1)
        layout.addWidget(playback_bar)
        layout.addWidget(self.message)
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

    def load(self, path, *, autoplay=False):
        path = Path(path)
        if is_link(path) or not path.is_file():
            self.clear()
            self.message.setText("映像が見つかりません。スマートグラスをつなぎ直し、端末を再確認してください。")
            self.message.show()
            return
        if path == self.path:
            if autoplay:
                self.player.setPosition(0)
                self.player.play()
            return
        self.player.stop()
        self.path = path
        self.display.setCurrentWidget(self.video)
        self.message.setText("再生すると映像と音声を確認できます。")
        self.message.hide()
        self.timeline.setRange(0, 0)
        self.clock.setText("00:00")
        self.duration_label.setText("00:00")
        self.player.setSource(QUrl.fromLocalFile(str(path)))
        self._enable(True)
        if autoplay:
            self.player.play()

    def clear(self):
        self.player.stop()
        self.player.setSource(QUrl())
        self.path = None
        self.display.setCurrentWidget(self.empty)
        self.timeline.setRange(0, 0)
        self.clock.setText("00:00")
        self.duration_label.setText("00:00")
        self.message.setText("左の一覧から録画を選んでください。")
        self.message.hide()
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
        self.play_button.setIcon(icon(
            "pause" if state == QMediaPlayer.PlaybackState.PlayingState else "play", "#ffffff", 18))

    def _position_changed(self, position):
        if not self.timeline.isSliderDown():
            self.timeline.setValue(position)
        self.clock.setText(time_text(position))
        self.duration_label.setText(time_text(self.player.duration()))

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
            self.message.show()
            self._enable(False)

    def close(self):
        self.clear()
        return super().close()
