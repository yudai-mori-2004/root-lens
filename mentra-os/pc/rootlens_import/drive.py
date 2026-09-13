"""Resumable, verified uploads to one configured shared Drive folder."""

from dataclasses import dataclass
import json
from pathlib import Path
import re
import threading
from urllib.parse import parse_qs, urlsplit

from .core import (FILES, HASH, UNIT_ID, ImportCancelled, ImportFailure,
                   check_cancelled, checksum, import_lock,
                   source_manifest_sha256, verify_local)
from .library import LOCAL_CLIP, read_recording
from .site import drive_folder_id, validate_service_account
from .upload_state import DRIVE_ID, UploadJournal, completed_unit_ids, state_directory

API = "https://www.googleapis.com/drive/v3"
UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files"
TOKEN_URI = "https://oauth2.googleapis.com/token"
FOLDER_MIME = "application/vnd.google-apps.folder"
FIELDS = "id,name,mimeType,parents,driveId,size,sha256Checksum,trashed,appProperties,capabilities(canAddChildren)"
CHUNK_SIZE = 8 * 1024 * 1024
QUERY_BATCH_SIZE = 20
RETRY_STATUSES = {408, 429, 500, 502, 503, 504}


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
    source_manifest_sha256: str


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


def _drive_id(value):
    if not isinstance(value, str) or not DRIVE_ID.fullmatch(value):
        raise ImportFailure("Google Driveの保存先を確認できません。もう一度「アップロード」を押してください。")
    return value


class DriveUploader:
    """One instance belongs to one worker thread and one site configuration."""

    def __init__(self, profile, state_dir=None, *, session=None, credentials=None, chunk_size=CHUNK_SIZE):
        self.parent_id = drive_folder_id(profile)
        validate_service_account(profile.service_account)
        self.profile = profile
        self.state_dir = state_dir
        if type(chunk_size) is not int or chunk_size < 256 * 1024 or chunk_size % (256 * 1024):
            raise ValueError("chunk_size must be a positive multiple of 256 KiB")
        self.chunk_size = min(chunk_size, CHUNK_SIZE)
        try:
            import requests
            from google.auth.transport.requests import Request
            from google.oauth2.service_account import Credentials
            self.session = session if session is not None else requests.Session()
            self.credentials = credentials if credentials is not None else Credentials.from_service_account_info(
                profile.service_account, scopes=["https://www.googleapis.com/auth/drive"])
            request = Request(session=self.session)

            def auth_request(url, method="GET", body=None, headers=None, **kwargs):
                if url != TOKEN_URI:
                    raise ImportFailure("アップロードの設定に誤りがあります。管理者に設定ファイルを確認してもらってください。")
                check_cancelled(self.cancel)
                return request(url, method=method, body=body, headers=headers, timeout=(10, 30),
                               allow_redirects=False)

            self.auth_request = auth_request
        except Exception:
            raise ImportFailure("アップロードの設定を読み込めません。管理者に事業所の設定ファイルを確認してもらってください。") from None
        self.cancel = threading.Event()
        self.callback = None
        self.journal = None
        self.drive_id = None
        self.done_bytes = 0
        self.total_bytes = 0

    def close(self):
        self.session.close()

    def validate_destination(self):
        """Authenticate and inspect the configured folder without changing Drive."""
        parent = self._get(self.parent_id)
        if (parent is None or parent.get("mimeType") != FOLDER_MIME or parent.get("trashed") is not False
                or not parent.get("driveId") or not parent.get("capabilities", {}).get("canAddChildren")):
            raise ImportFailure("Google Driveの「承認済みデータ」に保存できません。管理者に保存先と共有設定を確認してもらってください。")
        self.drive_id = _drive_id(parent["driveId"])
        return parent

    def _list_children(self, parents):
        condition = " or ".join(f"'{_drive_id(parent)}' in parents" for parent in parents)
        return self._list_files("trashed = false and (" + condition + ")")

    def _list_target_folders(self, unit_ids):
        units = " or ".join("appProperties has { key='rootlens_unit_id' and value='" + unit_id + "' }"
                            for unit_id in unit_ids)
        query = (f"'{self.parent_id}' in parents and trashed = false"
                 + " and appProperties has { key='rootlens_site' and value='" + self.profile.site_id + "' }"
                 + " and appProperties has { key='rootlens_kind' and value='recording' }"
                 + " and (" + units + ")")
        return self._list_files(query)

    def _list_files(self, query):
        """Read every result page for one bounded, explicitly scoped query."""
        # A site account can access its folders without being a shared-drive member.
        # The user corpus supports OR-parent queries under that limited permission.
        params = {"q": query, "corpora": "user",
                  "supportsAllDrives": "true",
                  "includeItemsFromAllDrives": "true", "pageSize": 1000,
                  "fields": "nextPageToken,incompleteSearch,files(" + FIELDS + ")"}
        result = {}
        tokens = set()
        while True:
            value = self._body(self._request("GET", API + "/files", params=dict(params)))
            files = value.get("files")
            if not isinstance(files, list) or value.get("incompleteSearch"):
                raise ImportFailure("Google Driveの録画を確認できませんでした。もう一度接続してください。")
            for item in files:
                if not isinstance(item, dict):
                    raise ImportFailure("Google Driveの録画情報を読み込めませんでした。もう一度接続してください。")
                file_id = _drive_id(item.get("id"))
                if file_id in result and result[file_id] != item:
                    raise ImportFailure("確認中にGoogle Driveの録画が変更されました。もう一度接続してください。")
                result[file_id] = item
            token = value.get("nextPageToken")
            if token is None:
                return list(result.values())
            if not isinstance(token, str) or not token or len(token) > 8192 or token in tokens:
                raise ImportFailure("Google Driveの録画一覧を確認できませんでした。もう一度接続してください。")
            tokens.add(token)
            params["pageToken"] = token

    def current_recordings(self, unit_ids, *, cancel_event=None):
        """Read only requested recordings; never enumerate the site's entire Drive.

        Every returned folder has four complete Drive files with SHA-256 values.
        The unit id identifies the recording while the hashes describe current Drive bytes.
        history on this PC. Callers can compare them with the connected device.
        A result is an observation during this request, not a permanent receipt.
        """
        self.cancel = cancel_event if cancel_event is not None else threading.Event()
        try:
            if isinstance(unit_ids, (str, bytes)):
                raise ValueError()
            targets = set(unit_ids)
            if any(not isinstance(unit_id, str) or not UNIT_ID.fullmatch(unit_id) for unit_id in targets):
                raise ValueError()
        except (TypeError, ValueError):
            raise ImportFailure("照合する録画情報を読み込めません。もう一度「接続」を押してください。") from None
        check_cancelled(self.cancel)
        if not targets:
            return {}
        try:
            return self._current_recordings(sorted(targets))
        except ImportCancelled:
            raise
        except ImportFailure:
            raise ImportFailure("Google Driveの録画を確認できませんでした。インターネット接続と事業所の設定を確認し、もう一度「接続」を押してください。") from None

    def _current_recordings(self, unit_ids):
        check_cancelled(self.cancel)
        parent = self._get(self.parent_id)
        if (parent is None or parent.get("id") != self.parent_id or parent.get("mimeType") != FOLDER_MIME
                or parent.get("trashed") is not False or not parent.get("driveId")):
            raise ImportFailure("Google Driveの「承認済みデータ」を確認できません。管理者に保存先と共有設定を確認してもらってください。")
        self.drive_id = _drive_id(parent["driveId"])
        candidates = {}
        for offset in range(0, len(unit_ids), QUERY_BATCH_SIZE):
            batch = unit_ids[offset:offset + QUERY_BATCH_SIZE]
            for folder in self._list_target_folders(batch):
                properties = folder.get("appProperties", {})
                if not isinstance(properties, dict):
                    continue
                unit_id = properties.get("rootlens_unit_id")
                if (properties.get("rootlens_site") == self.profile.site_id
                        and properties.get("rootlens_kind") == "recording"
                        and isinstance(unit_id, str) and unit_id in batch):
                    candidates.setdefault(unit_id, []).append(folder)
        folders = {}
        folder_observations = {}
        for unit_id, matches in candidates.items():
            if len(matches) != 1:
                continue
            folder = matches[0]
            name = folder.get("name")
            source_manifest = folder.get("appProperties", {}).get("rootlens_source_manifest")
            if (folder.get("parents") == [self.parent_id] and folder.get("driveId") == self.drive_id
                    and folder.get("trashed") is False and folder.get("mimeType") == FOLDER_MIME
                    and isinstance(name, str) and name == unit_id and LOCAL_CLIP.fullmatch(name)
                    and isinstance(source_manifest, str) and HASH.fullmatch(source_manifest)
                    and folder.get("appProperties") == {"rootlens_site": self.profile.site_id,
                        "rootlens_unit_id": unit_id, "rootlens_kind": "recording",
                        "rootlens_source_manifest": source_manifest}):
                folders[folder["id"]] = (unit_id, name, source_manifest)
                folder_observations[folder["id"]] = folder
        children = {folder_id: [] for folder_id in folders}
        folder_ids = list(folders)
        # Twenty parents keep the URL bounded even with maximum-length Drive IDs.
        for offset in range(0, len(folder_ids), QUERY_BATCH_SIZE):
            for item in self._list_children(folder_ids[offset:offset + QUERY_BATCH_SIZE]):
                parents = item.get("parents")
                if isinstance(parents, list):
                    for folder_id in parents:
                        if isinstance(folder_id, str) and folder_id in children:
                            children[folder_id].append(item)
        result = {}
        for folder_id, (unit_id, name, source_manifest) in folders.items():
            check_cancelled(self.cancel)
            files = self._current_files(children[folder_id], folder_id, unit_id)
            if files is None:
                continue
            source_files = {filename: {"size": item["size"], "sha256": item["sha256"]}
                            for filename, item in files.items()}
            if source_manifest_sha256(unit_id, source_files) != source_manifest:
                continue
            result[unit_id] = DriveRecording(unit_id, folder_id, name, files, source_manifest)
        check_cancelled(self.cancel)
        if not result:
            return result
        # A folder can move while its children are being read. Recheck membership
        # after reading the files before callers use this observation for cleanup.
        current_folders = {}
        complete_unit_ids = sorted(result)
        for offset in range(0, len(complete_unit_ids), QUERY_BATCH_SIZE):
            batch = complete_unit_ids[offset:offset + QUERY_BATCH_SIZE]
            for folder in self._list_target_folders(batch):
                properties = folder.get("appProperties", {})
                if not isinstance(properties, dict):
                    continue
                unit_id = properties.get("rootlens_unit_id")
                if isinstance(unit_id, str) and unit_id in batch:
                    current_folders.setdefault(unit_id, []).append(folder)
        if self._folder_identity(self._get(self.parent_id)) != self._folder_identity(parent):
            raise ImportFailure("確認中にGoogle Driveの保存先が変更されました。もう一度接続してください。")
        check_cancelled(self.cancel)
        return {unit_id: recording for unit_id, recording in result.items()
                if len(current_folders.get(unit_id, [])) == 1
                and self._folder_identity(current_folders[unit_id][0])
                == self._folder_identity(folder_observations[recording.folder_id])}

    @staticmethod
    def _folder_identity(value):
        if not isinstance(value, dict):
            return None
        return {key: value.get(key) for key in
                ("id", "name", "mimeType", "parents", "driveId", "trashed", "appProperties")}

    def _current_files(self, children, folder_id, unit_id):
        if len(children) != len(FILES):
            return None
        result = {}
        for item in children:
            name = item.get("name")
            size, sha256 = item.get("size"), item.get("sha256Checksum")
            mime_type = item.get("mimeType")
            if (not isinstance(name, str) or name not in FILES or name in result
                    or item.get("parents") != [folder_id] or item.get("driveId") != self.drive_id
                    or item.get("trashed") is not False
                    or not isinstance(mime_type, str) or not mime_type
                    or mime_type.startswith("application/vnd.google-apps.")
                    or item.get("appProperties") != {"rootlens_site": self.profile.site_id,
                        "rootlens_unit_id": unit_id, "rootlens_kind": "file", "rootlens_file": name}
                    or not isinstance(size, str) or not re.fullmatch(r"[1-9][0-9]{0,19}", size)
                    or not isinstance(sha256, str) or not HASH.fullmatch(sha256)):
                return None
            result[name] = {"id": item["id"], "size": int(size), "sha256": sha256}
        return result

    def _wait(self, attempt):
        if self.cancel.wait(min(0.25 * 2 ** attempt, 2)):
            check_cancelled(self.cancel)

    def _request(self, method, url, *, retry=True, authenticate=True, **kwargs):
        import requests
        from google.auth.exceptions import GoogleAuthError
        attempts = 4 if retry else 1
        for attempt in range(attempts):
            check_cancelled(self.cancel)
            headers = dict(kwargs.get("headers", {}))
            try:
                if authenticate:
                    self.credentials.before_request(self.auth_request, method, url, headers)
                options = {**kwargs, "headers": headers, "timeout": (10, 30), "allow_redirects": False}
                response = self.session.request(method, url, **options)
            except (requests.RequestException, GoogleAuthError):
                response = None
            check_cancelled(self.cancel)
            if response is not None and response.status_code not in RETRY_STATUSES:
                return response
            if response is not None:
                response.close()
            if attempt + 1 < attempts:
                self._wait(attempt)
        raise _Retryable("Google Driveとの通信が途切れました。インターネット接続を確認し、もう一度「アップロード」を押してください。") from None

    @staticmethod
    def _body(response, allowed=(200, 201)):
        try:
            if response.status_code not in allowed:
                code = response.status_code
                if code in (401, 403):
                    raise ImportFailure("Google Driveに保存できません。管理者にアップロードの設定、共有権限、空き容量を確認してもらってください。")
                raise ImportFailure(f"Google Driveに送信できませんでした。もう一度「アップロード」を押してください。解決しない場合は管理者に連絡してください（エラー {code}）。")
            value = response.json()
            if not isinstance(value, dict):
                raise ValueError()
            return value
        except (ValueError, TypeError):
            raise ImportFailure("Google Driveの状態を確認できませんでした。もう一度「アップロード」を押してください。") from None
        finally:
            response.close()

    def _get(self, file_id):
        response = self._request("GET", API + "/files/" + _drive_id(file_id),
                                 params={"supportsAllDrives": "true", "fields": FIELDS})
        if response.status_code == 404:
            response.close()
            return None
        return self._body(response)

    def _properties(self, filename=None):
        properties = {"rootlens_site": self.profile.site_id,
                      "rootlens_unit_id": self.journal.value["unit_id"],
                      "rootlens_kind": "recording" if filename is None else "file"}
        if filename is not None:
            properties["rootlens_file"] = filename
        else:
            properties["rootlens_source_manifest"] = self.journal.value["source_manifest_sha256"]
        return properties

    def _find(self, parent, filename=None):
        conditions = [f"'{_drive_id(parent)}' in parents", "trashed = false"]
        for key, value in self._properties(filename).items():
            conditions.append(f"appProperties has {{ key='{key}' and value='{value}' }}")
        response = self._request("GET", API + "/files", params={
            "q": " and ".join(conditions), "corpora": "drive", "driveId": self.drive_id,
            "supportsAllDrives": "true", "includeItemsFromAllDrives": "true",
            "pageSize": 100, "fields": "nextPageToken,incompleteSearch,files(" + FIELDS + ")"})
        value = self._body(response)
        files = value.get("files")
        if not isinstance(files, list) or value.get("incompleteSearch") or value.get("nextPageToken"):
            raise ImportFailure("Google Driveに保存済みの録画を確認できませんでした。もう一度「アップロード」を押してください。")
        if len(files) > 1:
            raise ImportFailure("Google Driveに同じ録画が複数あります。管理者に確認してください。")
        return files[0] if files else None

    def _new_id(self):
        value = self._body(self._request("GET", API + "/files/generateIds", params={"count": 1, "space": "drive"}))
        ids = value.get("ids")
        if not isinstance(ids, list) or len(ids) != 1:
            raise ImportFailure("Google Driveの保存先を準備できませんでした。もう一度「アップロード」を押してください。")
        return _drive_id(ids[0])

    def _validate_object(self, value, parent, filename=None):
        expected_name = self.recording_name if filename is None else filename
        if (not isinstance(value, dict) or value.get("name") != expected_name
                or value.get("parents") != [parent] or value.get("driveId") != self.drive_id
                or value.get("trashed") is not False
                or value.get("appProperties") != self._properties(filename)
                or (filename is None and value.get("mimeType") != FOLDER_MIME)
                or (filename is not None and value.get("mimeType", "").startswith("application/vnd.google-apps."))):
            raise ImportFailure("Google Driveの録画と保存先の情報が一致しません。管理者に確認してください。")
        _drive_id(value.get("id"))

    def _folder(self):
        saved_id = self.journal.value["folder_id"]
        value = self._get(saved_id) if saved_id else None
        if value is None:
            value = self._find(self.parent_id)
        if value is not None:
            self._validate_object(value, self.parent_id)
            self.journal.value["folder_id"] = value["id"]
            self.journal.save()
            return value["id"]
        if saved_id is None:
            saved_id = self._new_id()
            self.journal.value["folder_id"] = saved_id
            self.journal.save()
        response = self._request("POST", API + "/files", params={"supportsAllDrives": "true", "fields": FIELDS},
                                 json={"id": saved_id, "name": self.recording_name, "mimeType": FOLDER_MIME,
                                       "parents": [self.parent_id], "appProperties": self._properties()})
        if response.status_code == 409:
            response.close()
            value = self._get(saved_id)
        else:
            value = self._body(response)
        self._validate_object(value, self.parent_id)
        found = self._find(self.parent_id)
        if found is None or found.get("id") != saved_id:
            raise ImportFailure("Google Driveの保存先を確認できませんでした。もう一度「アップロード」を押してください。")
        return saved_id

    def _emit(self, state, filename="", current=0):
        if self.callback:
            self.callback(UploadProgress(self.journal.value["unit_id"], state,
                                         self.done_bytes + current, self.total_bytes, filename))

    def _verify_remote(self, filename, info):
        value = self._get(info["id"])
        self._validate_object(value, self.folder_id, filename)
        if str(value.get("size")) != str(info["size"]) or value.get("sha256Checksum") != info["sha256"]:
            raise ImportFailure(f"アップロードした {filename} が元のファイルと一致しません。PCの録画は残っています。管理者に確認してください。")
        return value

    def _start_session(self, filename, info):
        response = self._request("POST", UPLOAD_API, params={"uploadType": "resumable", "supportsAllDrives": "true", "fields": FIELDS},
                                 headers={"X-Upload-Content-Type": "video/mp4" if filename == "rgb.mp4" else "application/octet-stream",
                                          "X-Upload-Content-Length": str(info["size"])},
                                 json={"id": info["id"], "name": filename, "parents": [self.folder_id],
                                       "appProperties": self._properties(filename)})
        if response.status_code == 409:
            response.close()
            self._verify_remote(filename, info)
            return None
        if response.status_code not in (200, 201):
            self._body(response)
        try:
            url = _session_url(response.headers.get("Location"))
        finally:
            response.close()
        info["session"] = url
        self.journal.save()
        return url

    def _status(self, url, size):
        response = self._request("PUT", _session_url(url), authenticate=False,
                                 headers={"Content-Length": "0", "Content-Range": f"bytes */{size}"}, data=b"")
        try:
            if response.status_code in (200, 201):
                return size, True
            if response.status_code == 404:
                return None, False
            if response.status_code != 308:
                self._body(response)
            value = response.headers.get("Range")
            if value is None:
                return 0, False
            match = re.fullmatch(r"bytes=0-(\d+)", value)
            if match is None or not 0 < int(match[1]) + 1 <= size:
                raise ImportFailure("Google Driveへの送信状況を確認できません。もう一度「アップロード」を押してください。")
            return int(match[1]) + 1, False
        finally:
            response.close()

    def _send_file(self, filename, info, directory):
        value = self._get(info["id"]) if info["id"] else None
        if value is None:
            value = self._find(self.folder_id, filename)
        if value is not None:
            self._validate_object(value, self.folder_id, filename)
            info["id"] = value["id"]
            self.journal.save()
            self._verify_remote(filename, info)
            return
        if info["id"] is None:
            info["id"] = self._new_id()
            self.journal.save()
        session = info.get("session")
        offset, complete = self._status(session, info["size"]) if session else (None, False)
        if complete:
            return
        if offset is None:
            info["session"] = None
            self.journal.save()
            session = self._start_session(filename, info)
            if session is None:
                return
            offset = 0
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
                try:
                    response = self._request("PUT", _session_url(session), retry=False, authenticate=False,
                                             headers={"Content-Length": str(len(chunk)),
                                                      "Content-Range": f"bytes {offset}-{offset + len(chunk) - 1}/{info['size']}"},
                                             data=chunk)
                    if response.status_code in (200, 201):
                        response.close()
                        offset = info["size"]
                        complete = True
                    elif response.status_code == 308:
                        response.close()
                        offset, complete = self._status(session, info["size"])
                    else:
                        self._body(response)
                except _Retryable:
                    offset, complete = self._status(session, info["size"])
                if offset is None:
                    info["session"] = None
                    self.journal.save()
                    raise ImportFailure("アップロードを再開できる期限が切れました。もう一度「アップロード」を押してください。")
                if offset < previous:
                    raise ImportFailure("Google Driveへの送信状況を確認できません。もう一度「アップロード」を押してください。")
                self._emit("uploading", filename, offset)
                if complete:
                    return
                failures = failures + 1 if offset == previous else 0
                if failures >= 4:
                    raise ImportFailure("アップロードが進んでいません。インターネット接続を確認し、もう一度「アップロード」を押してください。")
                if failures:
                    self._wait(failures - 1)
        if not complete:
            raise ImportFailure("アップロードの完了を確認できませんでした。もう一度「アップロード」を押してください。")

    def upload_recording(self, path, on_progress=None, cancel_event=None):
        self.cancel = cancel_event if cancel_event is not None else threading.Event()
        self.callback = on_progress
        self.done_bytes = 0
        directory = Path(path)
        try:
            check_cancelled(self.cancel)
            recording = read_recording(directory)
            self.recording_name = directory.name
            self.total_bytes = sum((directory / name).stat().st_size for name in FILES)
            if self.callback:
                self.callback(UploadProgress(recording.unit_id, "verifying", 0, self.total_bytes))
            expected = {name: checksum(directory / name, self.cancel) for name in FILES}
            metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
            if metadata.get("unit_id") != recording.unit_id:
                raise ImportFailure("映像と録画情報が一致しません。管理者に確認してください。")
            manifest = {name: {"size": (directory / name).stat().st_size, "sha256": expected[name]} for name in FILES}
            lock_directory = state_directory(self.profile, self.state_dir)
            lock_directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            with import_lock(lock_directory):
                self.journal = UploadJournal(self.profile, recording.unit_id, manifest, self.state_dir)
                self.journal.value["completed"] = False
                self.journal.save()
                self.validate_destination()
                self.folder_id = self._folder()
                for filename in FILES:
                    info = self.journal.value["files"][filename]
                    info["verified"] = False
                    self.journal.save()
                    self._send_file(filename, info, directory)
                    self._emit("verifying_remote", filename, info["size"])
                    self._verify_remote(filename, info)
                    info["verified"] = True
                    info["session"] = None
                    self.journal.save()
                    self.done_bytes += info["size"]
                self._emit("verifying_remote")
                verify_local(directory, expected, metadata, self.cancel)
                unique_folder = self._find(self.parent_id)
                if unique_folder is None or unique_folder.get("id") != self.folder_id:
                    raise ImportFailure("Google Driveの録画フォルダを確認できませんでした。もう一度「アップロード」を押してください。")
                for filename in FILES:
                    info = self.journal.value["files"][filename]
                    self._verify_remote(filename, info)
                    unique_file = self._find(self.folder_id, filename)
                    if unique_file is None or unique_file.get("id") != info["id"]:
                        raise ImportFailure("Google Driveの録画ファイルを確認できませんでした。もう一度「アップロード」を押してください。")
                check_cancelled(self.cancel)
                self.journal.value["completed"] = True
                self.journal.save()
                self._emit("completed")
                return UploadResult(recording.unit_id, self.folder_id, self.total_bytes)
        except ImportFailure:
            raise
        except (OSError, ValueError, TypeError, KeyError):
            raise ImportFailure("録画またはアップロードの履歴を読み込めません。PCの録画は残っています。管理者に確認してください。") from None
