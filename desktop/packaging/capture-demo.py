"""Capture this app's own Qt widgets with an explicit synthetic video and fake upload."""

import argparse
import json
from pathlib import Path
import struct
import sys
import tempfile
import threading
import time

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from PySide6.QtCore import QRectF, Qt, QTimer
from PySide6.QtGui import QColor, QPainter
from PySide6.QtMultimedia import QAudioBufferOutput
from PySide6.QtWidgets import QApplication
from rootlens_import.desktop import ImportWindow
from rootlens_import.core import ClipProgress, FILES, ImportCancelled
from rootlens_import.drive import UploadProgress, UploadResult
from rootlens_import.library import recordings_directory
from rootlens_import.site import SiteProfile
from rootlens_import.branding import APP_NAME, app_icon


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sample-video", type=Path, required=True,
                        help="Generated demonstration footage only; never a real recording")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--site-id", default="site_bb_sheep")
    parser.add_argument("--site-name", default="BB SHEEP")
    args = parser.parse_args(arguments)
    sample = args.sample_video.resolve(strict=True)
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    app = QApplication.instance() or QApplication([])
    app.setApplicationName(APP_NAME)
    app.setApplicationDisplayName(APP_NAME)
    app.setWindowIcon(app_icon())
    completed, frames, audio = set(), [], []
    release = threading.Event()
    manifest = {"notice": "Actual Qt widgets and decoded generated video; fake upload only, no credentials or network.",
                "platform": sys.platform, "site_id": args.site_id, "site_name": args.site_name, "screens": {}}

    def wait_for(condition, timeout=15):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            app.processEvents()
            if condition():
                return
            time.sleep(.01)
        raise RuntimeError("The demonstration screen did not become ready.")

    class DemoUploader:
        def upload_recording(self, path, approval_event_id, on_progress, cancel_event):
            digest = json.loads((path / "metadata.json").read_text())["unit_id"]
            on_progress(UploadProgress(digest, "uploading", 8_400_000, 20_000_000, "rgb.mp4"))
            if not release.wait(30) or cancel_event.is_set():
                raise ImportCancelled("Demonstration cancelled")
            completed.add(digest)
            return UploadResult(digest, "DEMONSTRATION_ONLY", 20_000_000)

        def close(self):
            pass

    with tempfile.TemporaryDirectory(prefix="rootlens-guide-") as temporary:
        data = Path(temporary).resolve()
        def no_import(**kwargs):
            raise AssertionError("This capture cannot access USB recordings")
        window = ImportWindow(data / "absent-site.json", data / "data", no_import,
                              lambda profile, **kwargs: DemoUploader(), lambda profile, targets, cancel, gateway: {},
                              cleaner=lambda *args, **kwargs: None, gateway_factory=lambda profile: object(),
                              approver=lambda *args, **kwargs: "apv_demonstration")

        def snapshot(name):
            app.processEvents()
            result = window.grab()
            result.save(str(output / (name + "-widget-grab.png")))
            widgets = {}
            for label, widget in (("connect", window.connect_button), ("settings", window.settings_button),
                                  ("list", window.recording_list), ("video", window.preview.video),
                                  ("play", window.preview.play_button), ("previous", window.previous_button),
                                  ("next", window.next_button), ("upload", window.upload_button),
                                  ("cancel", window.cancel_upload_button), ("status", window.status_label),
                                  ("upload_status", window.upload_status_label), ("count", window.count_label)):
                point = widget.mapTo(window, widget.rect().topLeft())
                widgets[label] = {"x": point.x(), "y": point.y(), "width": widget.width(),
                                  "height": widget.height(), "visible": widget.isVisible()}
            if frames and window.preview.path:
                video = widgets["video"]
                area = QRectF(video["x"], video["y"], video["width"], video["height"])
                frame = frames[-1]
                fitted = frame.size().scaled(window.preview.video.size(), Qt.AspectRatioMode.KeepAspectRatio)
                target = QRectF(area.x() + (area.width() - fitted.width()) / 2,
                                area.y() + (area.height() - fitted.height()) / 2, fitted.width(), fitted.height())
                painter = QPainter(result)
                painter.fillRect(area, QColor("#161b19"))
                painter.drawImage(target, frame)
                painter.end()
                frame.save(str(output / (name + "-decoded-frame.png")))
            result.save(str(output / (name + ".png")))
            manifest["screens"][name] = {"logical_size": [window.width(), window.height()],
                                        "device_pixel_ratio": window.devicePixelRatio(), "widgets": widgets}

        try:
            window.show()
            wait_for(window.isVisible)
            snapshot("01-first-launch")
            def capture_settings():
                dialog = QApplication.activeModalWidget()
                if dialog is None:
                    QTimer.singleShot(50, capture_settings)
                    return
                dialog.grab().save(str(output / "02-site-settings.png"))
                manifest["screens"]["02-site-settings"] = {"logical_size": [dialog.width(), dialog.height()],
                                                             "device_pixel_ratio": dialog.devicePixelRatio()}
                dialog.reject()
            QTimer.singleShot(150, capture_settings)
            window.show_settings()
            root = recordings_directory(args.site_id, data / "data")
            video_bytes = sample.read_bytes()
            for index in range(3):
                # An ignored MP4 free box gives each demonstration distinct file bytes.
                video = video_bytes + struct.pack(">I4sI", 12, b"free", index)
                identity = f"unit_demo_20260911T0{index}0000000Z_0000000{index}"
                clip = root / identity
                clip.mkdir()
                (clip / "rgb.mp4").write_bytes(video)
                for filename in ("frames.jsonl", "imu.jsonl"):
                    (clip / filename).write_text('{"demonstration":true}\n', encoding="utf-8")
                (clip / "metadata.json").write_text(json.dumps({"schema": "rootlens.mentra.raw.v1",
                    "files": list(FILES), "unit_id": identity, "created_at": f"2026-09-11T0{index}:00:00.000Z",
                    "actual_duration_ms": 8000}), encoding="utf-8")
            window.set_profile(SiteProfile(args.site_id, args.site_name))
            window._drive_checked({}, "")
            for index, clip in enumerate(sorted(root.iterdir())):
                window._clip_progress(ClipProgress(f"rec-20260911T0{index}0000.000Z", clip, "ready"))
            window._flush_progress()
            window.status_label.setText("操作説明用サンプル：実際の撮影データではありません。")
            window.select_relative(1)
            sink = QAudioBufferOutput(window.preview)
            sink.audioBufferReceived.connect(lambda buffer: audio.append(buffer.byteCount()) if buffer.isValid() else None)
            window.preview.player.setAudioBufferOutput(sink)
            window.preview.video.videoSink().videoFrameChanged.connect(
                lambda frame: frames.append(frame.toImage()) if frame.isValid() else None)
            window.preview.mute_button.setChecked(True)
            window.preview.toggle_playback()
            wait_for(lambda: len(frames) > 10 and any(audio))
            window.preview.toggle_playback()
            snapshot(f"03-{args.site_id}-review")
            window.start_upload()
            wait_for(lambda: "42%" in window.status_label.text() and not window._refresh_timer.isActive())
            snapshot("04-upload-progress")
            release.set()
            wait_for(lambda: not window.busy)
            previous_count = len(frames)
            window.preview.toggle_playback()
            wait_for(lambda: len(frames) > previous_count + 3)
            window.preview.toggle_playback()
            snapshot("05-upload-complete")
            assert len(window.records) == 2 and window.recording_list.topLevelItemCount() == 2
            manifest.update(decoded_video_frames=len(frames), valid_audio_buffers=sum(bool(size) for size in audio),
                            all_original_files_retained=all(len(list(clip.iterdir())) == 4 for clip in root.iterdir()))
            (output / "capture-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        finally:
            release.set()
            if window.busy:
                window.cancel_event.set()
                wait_for(lambda: not window.busy)
            window.close()
            app.processEvents()
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
