"""Read-only packaged media-backend check using an explicitly selected local file."""

import argparse
from collections import deque
import json
import os
from pathlib import Path
import sys
import time

from PySide6.QtCore import QLoggingCategory, QTimer, qInstallMessageHandler, qVersion
from PySide6.QtMultimedia import QAudioBufferOutput, QMediaDevices, QMediaPlayer
from PySide6.QtWidgets import QApplication

from rootlens_import.preview import VideoPreview


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    args = parser.parse_args(arguments)
    path = args.file.expanduser()
    def stage(name):
        if sys.platform == 'win32':
            print(json.dumps({'stage': name, 'at': time.monotonic()}), flush=True)

    stage('start')
    if path.is_symlink() or not path.is_file():
        print(json.dumps({'ok': False, 'error': 'The selected local media file is unavailable.'}))
        return 1
    os.environ.setdefault('QT_DEBUG_PLUGINS', '1')
    os.environ.setdefault('QT_FFMPEG_DEBUG', '1')
    QLoggingCategory.setFilterRules('qt.multimedia.*=true\nqt.core.plugin.*=true')
    started = time.monotonic()
    startup_messages = []
    messages = deque(maxlen=160)
    transitions = []

    def qt_message(kind, context, message):
        entry = {'at_seconds': round(time.monotonic() - started, 3), 'kind': kind.name,
                 'category': context.category, 'text': message[:4000]}
        if len(startup_messages) < 40:
            startup_messages.append(entry)
        else:
            messages.append(entry)

    previous_handler = qInstallMessageHandler(qt_message)
    application = QApplication.instance() or QApplication([sys.argv[0]])
    stage('application')
    preview = VideoPreview()
    stage('preview')
    preview.resize(640, 430)
    preview.setWindowTitle('RootLens media check')
    preview.audio.setMuted(True)
    audio = QAudioBufferOutput(preview)
    preview.player.setAudioBufferOutput(audio)
    counts = {'video_frames': 0, 'audio_buffers': 0}
    result = {'done': False, 'code': 1, 'error': ''}

    def state():
        player = preview.player
        return {'available': player.isAvailable(), 'error': player.error().name,
                'error_string': player.errorString(), 'media_status': player.mediaStatus().name,
                'playback_state': player.playbackState().name, 'duration_ms': player.duration(),
                'position_ms': player.position(), 'buffer_progress': player.bufferProgress(),
                'has_audio': player.hasAudio(), 'has_video': player.hasVideo(),
                'source': player.source().toString(), 'preview_message': preview.message.text()}

    def transition(label, value):
        if len(transitions) < 80:
            transitions.append({'at_seconds': round(time.monotonic() - started, 3), 'event': label,
                                'value': value.name if hasattr(value, 'name') else value})

    def finish(code, error=''):
        if result['done']:
            return
        result.update(done=True, code=code, error=error, final_state=state())
        stage('finish-before-clear')
        preview.clear()
        stage('finish-after-clear')
        preview.close()
        stage('finish-after-close')
        application.exit(code)

    def evaluate():
        if counts['video_frames'] and counts['audio_buffers']:
            finish(0)

    def video_frame(frame):
        if frame.isValid():
            counts['video_frames'] += 1
            if counts['video_frames'] == 1:
                stage('video-frame')
            evaluate()

    def audio_buffer(buffer):
        if buffer.isValid() and buffer.byteCount() > 0:
            counts['audio_buffers'] += 1
            if counts['audio_buffers'] == 1:
                stage('audio-buffer')
            evaluate()

    def media_error(error, detail):
        if error != QMediaPlayer.Error.NoError:
            finish(1, detail)

    preview.video.videoSink().videoFrameChanged.connect(video_frame)
    audio.audioBufferReceived.connect(audio_buffer)
    preview.player.errorOccurred.connect(media_error)
    preview.player.mediaStatusChanged.connect(lambda value: transition('media_status', value))
    preview.player.playbackStateChanged.connect(lambda value: transition('playback_state', value))
    preview.player.durationChanged.connect(lambda value: transition('duration_ms', value))
    deadline = QTimer(preview)
    deadline.setSingleShot(True)
    deadline.timeout.connect(lambda: finish(1, 'No decoded video frame and audio buffer within 15 seconds'))
    preview.show()
    stage('before-load')
    preview.load(path.resolve())
    stage('after-load')

    def start_playback():
        if not preview.player.isAvailable() or preview.player.error() != QMediaPlayer.Error.NoError:
            finish(1, preview.player.errorString() or 'The multimedia backend is unavailable.')
        else:
            deadline.start(15000)
            stage('before-playback')
            preview.toggle_playback()
            stage('after-playback')

    QTimer.singleShot(0, start_playback)
    application.exec()
    stage('after-event-loop')
    diagnostic = {'qt_version': qVersion(), 'platform': sys.platform,
                  'audio_output_devices': [device.description() for device in QMediaDevices.audioOutputs()],
                  'file_bytes': path.stat().st_size, 'state': result.get('final_state'),
                  'transitions': transitions, 'qt_messages': startup_messages + list(messages),
                  'environment': {name: os.environ.get(name) for name in
                                  ('QT_MEDIA_BACKEND', 'QT_QPA_PLATFORM', 'QT_FFMPEG_DECODING_HW_DEVICE_TYPES',
                                   'QT_DISABLE_HW_TEXTURES_CONVERSION', 'QSG_RHI_BACKEND')}}
    # Plugin teardown occurs after Python exits; stop diagnostic-only debug logging
    # before restoring the platform logger for that teardown.
    QLoggingCategory.setFilterRules('qt.multimedia.*.debug=false\nqt.core.plugin.*.debug=false\nqt.core.library.debug=false')
    qInstallMessageHandler(previous_handler)
    if sys.stdout is not None:
        print(json.dumps({**counts, 'ok': result['code'] == 0, 'error': result['error'],
                          'diagnostic': diagnostic}, ensure_ascii=False))
    return result['code']
