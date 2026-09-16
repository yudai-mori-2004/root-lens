"""Decode synthetic video and audio through the embedded player."""

from pathlib import Path
import os
import shutil
import tempfile
import unittest

from PySide6.QtMultimedia import QAudioBufferOutput, QMediaPlayer
from PySide6.QtWidgets import QApplication

from rootlens_import.preview import VideoPreview, time_text
from test_desktop import wait_for


class PreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.video = Path(cls.temporary.name) / 'synthetic-av.mp4'
        fixture = Path(__file__).resolve().parents[1] / 'packaging' / 'fixtures' / 'kitchen-demo.mp4'
        shutil.copyfile(fixture, cls.video)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def setUp(self):
        self.preview = VideoPreview()
        self.preview.audio.setMuted(True)
        self.preview.show()

    def tearDown(self):
        self.preview.close()
        self.preview.deleteLater()
        QApplication.processEvents()

    @unittest.skipIf(os.name == 'nt' and os.environ.get('CI') == 'true',
                     'The installed Windows app is tested with --check-media in acceptance.')
    def test_embedded_player_decodes_video_frames_and_audio_buffers(self):
        video_frames, audio_buffers = [], []
        self.preview.video.videoSink().videoFrameChanged.connect(lambda frame: video_frames.append(frame.isValid()))
        audio = QAudioBufferOutput(self.preview)
        audio.audioBufferReceived.connect(lambda buffer: audio_buffers.append(buffer.isValid()))
        self.preview.player.setAudioBufferOutput(audio)
        self.preview.load(self.video)
        self.assertNotEqual(self.preview.player.playbackState(), QMediaPlayer.PlaybackState.PlayingState)
        self.preview.toggle_playback()
        wait_for(lambda: any(video_frames) and any(audio_buffers), 8)
        self.assertTrue(self.preview.player.hasVideo())
        self.assertTrue(self.preview.player.hasAudio())
        self.assertEqual(self.preview.player.audioOutput(), self.preview.audio)
        self.assertGreater(self.preview.player.duration(), 0)
        self.preview.toggle_playback()
        self.assertEqual(self.preview.player.playbackState(), QMediaPlayer.PlaybackState.PausedState)
        self.preview.player.setPosition(1000)
        wait_for(lambda: self.preview.timeline.value() >= 1000)
        self.preview.clear()
        self.assertTrue(self.preview.player.source().isEmpty())
        self.assertFalse(self.preview.play_button.isEnabled())

    def test_missing_file_clears_previous_media(self):
        self.preview.load(self.video)
        self.preview.load(self.video.parent / 'missing.mp4')
        self.assertIsNone(self.preview.path)
        self.assertTrue(self.preview.player.source().isEmpty())


class TimeTextTests(unittest.TestCase):
    def test_long_recording_and_zero(self):
        self.assertEqual(time_text(0), '00:00')
        self.assertEqual(time_text(5 * 3600 * 1000 + 23000), '5:00:23')


if __name__ == '__main__':
    unittest.main()
