"""Upload recording bytes through server-issued Google Drive sessions."""

from dataclasses import dataclass
import json
from pathlib import Path
import re
import threading
from urllib.parse import parse_qs, urlsplit

from .core import (FILES, HASH, UNIT_ID, ImportCancelled, ImportFailure,
                   check_cancelled, checksum, import_lock, verify_local)
from .library import read_recording
from .upload_state import UploadJournal, completed_unit_ids, state_directory

CHUNK_SIZE = 8 * 1024 * 1024
RETRY_STATUSES = {408, 429, 500, 502, 503, 504}
DRIVE_ID = re.compile(r"[A-Za-z0-9_-]{1,200}\Z")


@dataclass(frozen=True)
class UploadProgress:
    unit_id: str
    state: str
    bytes_uploaded: int
    total_bytes: int
    file_name: str = ""


@dataclass(frozen=True)
class UploadResult:
    unit_id: str
    folder_id: str
    total_bytes: int


@dataclass(frozen=True)
class DriveRecording:
    unit_id: str
    folder_id: str
    name: str
    files: dict[str, dict]
    files_sha256: str


class _Retryable(ImportFailure):
    pass


def _session_url(value):
    try:
        url = urlsplit(value)
        query = parse_qs(url.query)
        valid = (url.scheme == "https" and url.netloc == "www.googleapis.com"
                 and url.path == "/upload/drive/v3/files" and not url.fragment
                 and query.get("uploadType") == ["resumable"]
                 and len(query.get("upload_id", [])) == 1 and bool(query["upload_id"][0])
                 and len(value) <= 8192)
    except (TypeError, ValueError):
        valid = False
    if not valid:
        raise ImportFailure("アップロードを再開するための情報を読み込めません。管理者に確認してください。")
    return value


class DriveUploader:
    """The API authorizes Drive metadata; this client sends only file bytes."""

    def __init__(self, profile, state_dir=None, *, gateway, session=None, chunk_size=CHUNK_SIZE):
        if type(chunk_size) is not int or chunk_size < 256 * 1024 or chunk_size % (256 * 1024):
            raise ValueError("chunk_size must be a positive multiple of 256 KiB")
        try:
            import requests
        except ImportError:
            if session is None:
                raise ImportFailure("アップロード機能がありません。アプリを更新してください。") from None
        self.profile = profile
        self.state_dir = state_dir
        self.gateway = gateway
        self.session = session or requests.Session()
        self.chunk_size = min(chunk_size, CHUNK_SIZE)
        self.cancel = threading.Event()
        self.callback = None
        self.journal = None
        self.done_bytes = 0
        self.total_bytes = 0

    def close(self):
        self.session.close()

    def _emit(self, state, filename="", current=0):
        if self.callback:
            self.callback(UploadProgress(self.journal.value["unit_id"], state,
                                         self.done_bytes + current, self.total_bytes, filename))

    def _request(self, method, url, **kwargs):
        try:
            import requests
            errors = (requests.RequestException,)
        except ImportError:
            errors = (OSError,)
        for attempt in range(4):
            check_cancelled(self.cancel)
            try:
                response = self.session.request(method, _session_url(url), timeout=(10, 60),
                                                allow_redirects=False, **kwargs)
            except errors:
                response = None
            if response is not None and response.status_code not in RETRY_STATUSES:
                return response
            if response is not None:
                response.close()
            if attempt < 3 and self.cancel.wait(min(0.25 * 2 ** attempt, 2)):
                check_cancelled(self.cancel)
        raise _Retryable("Google Driveとの通信が途切れました。インターネット接続を確認してください。")

    def _status(self, url, size):
        response = self._request("PUT", url, headers={
            "Content-Length": "0", "Content-Range": f"bytes */{size}",
        }, data=b"")
        try:
            if response.status_code in (200, 201):
                return size, True
            if response.status_code == 404:
                return None, False
            if response.status_code != 308:
                raise ImportFailure("Google Driveへの送信状況を確認できません。もう一度アップロードしてください。")
            sent = response.headers.get("Range")
            if sent is None:
                return 0, False
            match = re.fullmatch(r"bytes=0-(\d+)", sent)
            if match is None or not 0 < int(match[1]) + 1 <= size:
                raise ImportFailure("Google Driveへの送信状況を確認できません。もう一度アップロードしてください。")
            return int(match[1]) + 1, False
        finally:
            response.close()

    def _send_file(self, filename, info, directory):
        url = _session_url(info["session"])
        offset, complete = self._status(url, info["size"])
        if offset is None:
            raise _Retryable("Google Driveのアップロードセッションが失効しました。")
        failures = 0
        with (directory / filename).open("rb") as source:
            while offset < info["size"]:
                check_cancelled(self.cancel)
                source.seek(offset)
                chunk = source.read(min(self.chunk_size, info["size"] - offset))
                if not chunk:
                    raise ImportFailure("送信中に録画ファイルが変更されました。管理者に確認してください。")
                self._emit("uploading", filename, offset)
                previous = offset
                response = self._request("PUT", url, headers={
                    "Content-Length": str(len(chunk)),
                    "Content-Range": f"bytes {offset}-{offset + len(chunk) - 1}/{info['size']}",
                }, data=chunk)
                try:
                    if response.status_code in (200, 201):
                        offset, complete = info["size"], True
                    elif response.status_code == 308:
                        response.close()
                        offset, complete = self._status(url, info["size"])
                    elif response.status_code == 404:
                        raise _Retryable("Google Driveのアップロードセッションが失効しました。")
                    else:
                        raise ImportFailure("Google Driveへ送信できませんでした。もう一度アップロードしてください。")
                finally:
                    response.close()
                if offset is None or offset < previous:
                    raise ImportFailure("Google Driveへの送信状況を確認できません。もう一度アップロードしてください。")
                self._emit("uploading", filename, offset)
                failures = failures + 1 if offset == previous else 0
                if failures >= 4:
                    raise ImportFailure("アップロードが進んでいません。インターネット接続を確認してください。")
            if not complete:
                raise ImportFailure("アップロードの完了を確認できませんでした。もう一度アップロードしてください。")

    def _apply_preparation(self, value):
        attempt_id, folder_id, rows = value.get("attemptId"), value.get("folderId"), value.get("files")
        if (not isinstance(attempt_id, str) or not attempt_id or not isinstance(folder_id, str)
                or not DRIVE_ID.fullmatch(folder_id) or not isinstance(rows, list)
                or len(rows) != len(self.journal.value["files"])):
            raise ImportFailure("アップロードの準備情報を読み込めませんでした。もう一度アップロードしてください。")
        sessions = {}
        for row in rows:
            if (not isinstance(row, dict) or row.get("path") not in self.journal.value["files"]
                    or type(row.get("complete")) is not bool or row["path"] in sessions):
                raise ImportFailure("アップロードの準備情報を読み込めませんでした。もう一度アップロードしてください。")
            if not row["complete"]:
                _session_url(row.get("uploadUrl"))
            sessions[row["path"]] = row
        self.journal.value["attempt_id"] = attempt_id
        self.journal.value["folder_id"] = folder_id
        for name, row in sessions.items():
            info = self.journal.value["files"][name]
            info["uploaded"] = row["complete"]
            info["session"] = None if row["complete"] else row["uploadUrl"]
        self.journal.save()

    def _prepare(self, approval_event_id):
        value = self.gateway.prepare_upload(
            self.journal.value["unit_id"],
            self.journal.value["files_sha256"],
            self.journal.value["files"],
            approval_event_id,
        )
        self._apply_preparation(value)

    def current_recordings(self, unit_ids, *, cancel_event=None):
        self.cancel = cancel_event or threading.Event()
        if isinstance(unit_ids, (str, bytes)):
            raise ImportFailure("照合する録画情報を読み込めません。もう一度接続してください。")
        targets = set(unit_ids)
        if any(not isinstance(unit_id, str) or not UNIT_ID.fullmatch(unit_id) for unit_id in targets):
            raise ImportFailure("照合する録画情報を読み込めません。もう一度接続してください。")
        if not targets:
            return {}
        check_cancelled(self.cancel)
        rows = self.gateway.current_recordings(targets)
        result = {}
        for row in rows:
            if (not isinstance(row, dict) or row.get("unitId") not in targets
                    or not isinstance(row.get("folderId"), str)
                    or not isinstance(row.get("filesSha256"), str)
                    or not HASH.fullmatch(row["filesSha256"])
                    or not isinstance(row.get("files"), dict) or not row["files"]):
                raise ImportFailure("Google Driveの録画情報を読み込めませんでした。もう一度接続してください。")
            files = row["files"]
            if any(not isinstance(item, dict) or type(item.get("size")) is not int
                   or not isinstance(item.get("sha256"), str) or not HASH.fullmatch(item["sha256"])
                   for item in files.values()):
                raise ImportFailure("Google Driveの録画情報を読み込めませんでした。もう一度接続してください。")
            unit_id = row["unitId"]
            result[unit_id] = DriveRecording(unit_id, row["folderId"], unit_id, files,
                                              row["filesSha256"])
        return result

    def upload_recording(self, path, approval_event_id, on_progress=None, cancel_event=None):
        if not isinstance(approval_event_id, str) or not approval_event_id.startswith("apv_"):
            raise ImportFailure("この録画の承認記録を確認できません。もう一度承認してください。")
        self.cancel = cancel_event or threading.Event()
        self.callback = on_progress
        self.done_bytes = 0
        directory = Path(path)
        try:
            recording = read_recording(directory)
            self.total_bytes = sum((directory / name).stat().st_size for name in FILES)
            if self.callback:
                self.callback(UploadProgress(recording.unit_id, "verifying", 0, self.total_bytes))
            expected = {name: checksum(directory / name, self.cancel) for name in FILES}
            metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
            manifest = {name: {"size": (directory / name).stat().st_size, "sha256": expected[name]}
                        for name in FILES}
            lock_directory = state_directory(self.profile, self.state_dir)
            lock_directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            with import_lock(lock_directory):
                self.journal = UploadJournal(self.profile, recording.unit_id, manifest, self.state_dir)
                self.journal.value["completed"] = False
                self._prepare(approval_event_id)
                for filename in FILES:
                    info = self.journal.value["files"][filename]
                    if not info["uploaded"]:
                        try:
                            self._send_file(filename, info, directory)
                        except _Retryable:
                            self._prepare(approval_event_id)
                            info = self.journal.value["files"][filename]
                            if not info["uploaded"]:
                                self._send_file(filename, info, directory)
                        info["uploaded"] = True
                        info["session"] = None
                        self.journal.save()
                    self.done_bytes += info["size"]
                self._emit("verifying_remote")
                verify_local(directory, expected, metadata, self.cancel)
                verified = self.gateway.verify_upload(self.journal.value["attempt_id"])
                if verified.get("unitId") != recording.unit_id or verified.get("folderId") != self.journal.value["folder_id"]:
                    raise ImportFailure("Google Driveに保存した録画を確認できませんでした。もう一度アップロードしてください。")
                self.journal.value["completed"] = True
                self.journal.save()
                self._emit("completed")
                return UploadResult(recording.unit_id, self.journal.value["folder_id"], self.total_bytes)
        except (ImportCancelled, ImportFailure):
            raise
        except (OSError, ValueError, TypeError, KeyError):
            raise ImportFailure("録画またはアップロードの履歴を読み込めません。PCの録画は残っています。管理者に確認してください。") from None
