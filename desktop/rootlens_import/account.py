"""Browser login and private RootLens session storage for the desktop app."""

from base64 import urlsafe_b64encode
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import threading
from urllib.parse import parse_qs, urlsplit

from .core import ImportFailure, check_cancelled, is_link
from .library import settings_path
from .site import write_private_json

DEFAULT_API_ORIGIN = "https://www.rootlens.io"
SESSION_SCHEMA = "rootlens.desktop-session.v1"
SESSION_MAX_BYTES = 16 * 1024


def _valid_token(token):
    return (isinstance(token, str) and 32 <= len(token) <= 4096
            and token.isascii() and not any(character.isspace() for character in token))


class SessionStore:
    def __init__(self, path=None):
        self.path = Path(path) if path is not None else settings_path().with_name("session.json")

    def load(self):
        if not self.path.exists():
            return None
        try:
            if is_link(self.path) or not self.path.is_file() or self.path.stat().st_size > SESSION_MAX_BYTES:
                raise ValueError()
            value = json.loads(self.path.read_text(encoding="utf-8"))
            if (not isinstance(value, dict) or set(value) != {"schema", "token"}
                    or value["schema"] != SESSION_SCHEMA or not _valid_token(value["token"])):
                raise ValueError()
            return value["token"]
        except (OSError, ValueError, UnicodeError, TypeError):
            raise ImportFailure("このPCのログイン情報を読み込めません。設定からもう一度ログインしてください。") from None

    def save(self, token):
        if not _valid_token(token):
            raise ImportFailure("ログイン情報を保存できませんでした。設定からもう一度ログインしてください。")
        try:
            write_private_json(self.path, {"schema": SESSION_SCHEMA, "token": token})
        except (OSError, ImportFailure) as error:
            raise ImportFailure("このPCにログイン情報を保存できません。管理者に保存場所を確認してもらってください。") from error

    def clear(self):
        try:
            self.path.unlink(missing_ok=True)
        except OSError as error:
            raise ImportFailure("このPCのログイン情報を削除できません。管理者に保存場所を確認してもらってください。") from error


def _api_origin(value=None):
    origin = (value or os.environ.get("ROOTLENS_API_ORIGIN") or DEFAULT_API_ORIGIN).rstrip("/")
    parsed = urlsplit(origin)
    production = parsed.scheme == "https" and parsed.netloc in ("rootlens.io", "www.rootlens.io")
    development = parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "localhost") and parsed.port
    if not (production or development) or parsed.path or parsed.query or parsed.fragment:
        raise ImportFailure("RootLensへの接続先を確認できません。アプリを更新してください。")
    return origin


def _response_json(response):
    try:
        value = response.json()
    except (ValueError, json.JSONDecodeError):
        raise ImportFailure("RootLensからの応答を読み込めませんでした。しばらくしてからやり直してください。") from None
    if not isinstance(value, dict):
        raise ImportFailure("RootLensからの応答を読み込めませんでした。しばらくしてからやり直してください。")
    return value


def _sites(value):
    rows = value.get("sites")
    if not isinstance(rows, list) or not rows:
        raise ImportFailure("このアカウントに利用可能な事業所がありません。管理画面を確認してください。")
    result = []
    for row in rows:
        if (not isinstance(row, dict) or not isinstance(row.get("id"), str)
                or not isinstance(row.get("name"), str) or not row["id"] or not row["name"]):
            raise ImportFailure("事業所の情報を読み込めませんでした。管理者に確認してください。")
        result.append({"id": row["id"], "name": row["name"]})
    return result


class _CallbackHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlsplit(self.path)
        query = parse_qs(parsed.query)
        if parsed.path != "/callback" or set(query) - {"code", "state"}:
            self.send_error(404)
            return
        self.server.callback_result = {
            "code": query.get("code", [""])[0],
            "state": query.get("state", [""])[0],
        }
        body = "<!doctype html><meta charset=utf-8><title>RootLens</title><p>ログインが完了しました。この画面を閉じてRootLensへ戻ってください。</p>".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_):
        pass


class RootLensAccount:
    def __init__(self, api_origin=None, *, session=None, store=None):
        try:
            import requests
        except ImportError:
            raise ImportFailure("RootLensへのログイン機能がありません。アプリを更新してください。") from None
        self.api_origin = _api_origin(api_origin)
        self.session = session or requests.Session()
        self.store = store or SessionStore()

    def close(self):
        self.session.close()

    def _request(self, method, path, *, token=None, json_body=None):
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        try:
            response = self.session.request(method, self.api_origin + path, headers=headers,
                                            json=json_body, timeout=(10, 30), allow_redirects=False)
        except Exception as error:
            raise ImportFailure("RootLensへ接続できません。インターネット接続を確認してください。") from error
        try:
            value = _response_json(response) if response.content else {}
            return response.status_code, value
        finally:
            response.close()

    def current(self):
        token = self.store.load()
        if not token:
            return None
        status, value = self._request("GET", "/api/v1/desktop-auth/session", token=token)
        if status == 401:
            self.store.clear()
            return None
        if status != 200:
            raise ImportFailure("ログイン状態を確認できませんでした。しばらくしてからやり直してください。")
        return {"token": token, "sites": _sites(value)}

    def login(self, open_browser, cancel_event=None):
        cancel = cancel_event or threading.Event()
        verifier = secrets.token_urlsafe(64)
        challenge = urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
        client_state = secrets.token_urlsafe(32)
        server = ThreadingHTTPServer(("127.0.0.1", 0), _CallbackHandler)
        server.timeout = 0.25
        server.callback_result = None
        redirect_uri = f"http://127.0.0.1:{server.server_port}/callback"
        try:
            status, value = self._request("POST", "/api/v1/desktop-auth/start", json_body={
                "redirectUri": redirect_uri,
                "codeChallenge": challenge,
                "clientState": client_state,
            })
            authorization_url = value.get("authorizationUrl")
            if status != 201 or not isinstance(authorization_url, str):
                raise ImportFailure("ログインを開始できませんでした。しばらくしてからやり直してください。")
            if not open_browser(authorization_url):
                raise ImportFailure("ブラウザを開けませんでした。既定のブラウザを確認してください。")
            while server.callback_result is None:
                check_cancelled(cancel)
                server.handle_request()
            callback = server.callback_result
            if callback["state"] != client_state or not callback["code"]:
                raise ImportFailure("ログインの応答を確認できませんでした。最初からやり直してください。")
            status, value = self._request("POST", "/api/v1/desktop-auth/token", json_body={
                "code": callback["code"], "codeVerifier": verifier,
            })
            token = value.get("sessionToken")
            if status != 200 or not isinstance(token, str) or len(token) < 32:
                raise ImportFailure("ログインを完了できませんでした。ブラウザからやり直してください。")
            sites = _sites(value)
            self.store.save(token)
            return {"token": token, "sites": sites}
        finally:
            server.server_close()

    def logout(self):
        token = self.store.load()
        try:
            if token:
                self._request("DELETE", "/api/v1/desktop-auth/session", token=token)
        finally:
            self.store.clear()

    def gateway(self, profile):
        token = self.store.load()
        if not token:
            raise ImportFailure("RootLensへログインしてください。")
        return RootLensGateway(self, token, profile.site_id)


class RootLensGateway:
    def __init__(self, account, token, site_id):
        self.account = account
        self.token = token
        self.site_id = site_id

    def _request(self, method, path, body=None, failure_message="RootLensで処理を完了できませんでした。しばらくしてからやり直してください。"):
        headers = {"Accept": "application/json", "Authorization": "Bearer " + self.token,
                   "X-RootLens-Site-Id": self.site_id}
        try:
            response = self.account.session.request(
                method, self.account.api_origin + path, headers=headers, json=body,
                timeout=(10, 60), allow_redirects=False,
            )
        except Exception as error:
            raise ImportFailure("RootLensへ接続できません。インターネット接続を確認してください。") from error
        try:
            value = _response_json(response) if response.content else {}
            if response.status_code == 401:
                raise ImportFailure("ログインの有効期限が切れました。設定からもう一度ログインしてください。")
            if not 200 <= response.status_code < 300:
                raise ImportFailure(failure_message)
            return value
        finally:
            response.close()

    def current_recordings(self, unit_ids):
        value = self._request("POST", "/api/v1/drive-recordings", {"unitIds": sorted(unit_ids)},
                              "Google Driveの録画情報を読み込めませんでした。もう一度接続してください。")
        rows = value.get("recordings")
        if not isinstance(rows, list):
            raise ImportFailure("Google Driveの録画情報を読み込めませんでした。もう一度接続してください。")
        return rows

    def prepare_upload(self, unit_id, source_manifest_sha256, files, approval_event_id):
        return self._request("POST", "/api/v1/drive-uploads", {
            "unitId": unit_id,
            "sourceManifestSha256": source_manifest_sha256,
            "approvalEventId": approval_event_id,
            "files": [{"name": name, "bytes": item["size"], "sha256": item["sha256"]}
                      for name, item in sorted(files.items())],
        }, "Google Driveへの保存を準備できませんでした。しばらくしてからやり直してください。")

    def verify_upload(self, attempt_id):
        return self._request("POST", f"/api/v1/drive-uploads/{attempt_id}/verify", failure_message=
                             "Google Drive上の保存結果を確認できませんでした。もう一度お試しください。")

    def create_approval(self, unit_id, source_manifest_sha256, files):
        return self._request("POST", "/api/v1/approval-signatures", {
            "unitId": unit_id,
            "sourceManifestSha256": source_manifest_sha256,
            "files": [{"name": name, "bytes": item["size"], "sha256": item["sha256"]}
                      for name, item in sorted(files.items())],
        }, "事前同意の記録を確認できないため、提供承認を開始できませんでした。管理者に確認してください。")

    def approval_status(self, approval_id):
        return self._request("GET", f"/api/v1/approval-signatures/{approval_id}", failure_message=
                             "提供承認の状態を確認できませんでした。もう一度お試しください。")
