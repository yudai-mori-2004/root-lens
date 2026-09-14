"""Bind an explicit SMS-authenticated approval to the recording selected in Desktop."""

from pathlib import Path
import threading
import webbrowser

from .core import FILES, ImportFailure, check_cancelled, checksum, unit_files_sha256
from .library import read_recording


def recording_manifest(path, cancel_event=None):
    cancel = cancel_event or threading.Event()
    directory = Path(path)
    recording = read_recording(directory)
    files = {
        name: {"size": (directory / name).stat().st_size, "sha256": checksum(directory / name, cancel)}
        for name in FILES
    }
    return recording, files, unit_files_sha256(recording.unit_id, files)


def approve_recording(path, gateway, cancel_event=None, open_browser=webbrowser.open):
    cancel = cancel_event or threading.Event()
    recording, files, digest = recording_manifest(path, cancel)
    approval = gateway.create_approval(recording.unit_id, digest, files)
    if approval.get("status") == "complete" and isinstance(approval.get("approvalEventId"), str):
        return approval["approvalEventId"]
    approval_id, approval_url = approval.get("approvalId"), approval.get("approvalUrl")
    if not isinstance(approval_id, str) or not isinstance(approval_url, str):
        raise ImportFailure("承認手続きを開始できませんでした。管理者に確認してください。")
    if not open_browser(approval_url):
        raise ImportFailure("承認画面を開けませんでした。既定のブラウザを確認してください。")
    while True:
        check_cancelled(cancel)
        status = gateway.approval_status(approval_id)
        if status.get("status") == "complete" and isinstance(status.get("approvalEventId"), str):
            _, current_files, current_digest = recording_manifest(path, cancel)
            if current_digest != digest or current_files != files:
                raise ImportFailure("承認後に録画の内容が変わりました。もう一度確認して承認してください。")
            return status["approvalEventId"]
        if status.get("status") == "expired":
            raise ImportFailure("承認画面の有効期限が切れました。もう一度アップロードしてください。")
        if cancel.wait(1):
            check_cancelled(cancel)
