import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit
from urllib.request import urlopen

from rootlens_import.account import RootLensAccount, SessionStore
from rootlens_import.core import ImportFailure


class Store:
    def __init__(self, token=None):
        self.token = token

    def load(self):
        return self.token

    def save(self, token):
        self.token = token

    def clear(self):
        self.token = None


class Response:
    def __init__(self, status, value=None):
        self.status_code = status
        self.value = value or {}
        self.content = json.dumps(self.value).encode() if value is not None else b""

    def json(self):
        return self.value

    def close(self):
        pass


class Session:
    def __init__(self):
        self.requests = []

    def request(self, method, url, **kwargs):
        self.requests.append((method, url, kwargs))
        path = urlsplit(url).path
        if path.endswith("/start"):
            return Response(201, {"authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth"})
        if path.endswith("/token"):
            return Response(200, {"sessionToken": "s" * 43, "sites": [{"id": "site_test", "name": "試験"}]})
        if path.endswith("/session") and method == "GET":
            return Response(200, {"sites": [{"id": "site_test", "name": "試験"}]})
        if path.endswith("/session") and method == "DELETE":
            return Response(204)
        raise AssertionError((method, url))

    def close(self):
        pass


class AccountTests(unittest.TestCase):
    def test_session_store_uses_private_file_and_clear_removes_it(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "session.json"
            store = SessionStore(path)
            token = "s" * 43
            self.assertIsNone(store.load())
            store.save(token)
            self.assertEqual(store.load(), token)
            if os.name != "nt":
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            store.clear()
            self.assertFalse(path.exists())

    def test_session_store_rejects_malformed_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "session.json"
            path.write_text('{"schema":"rootlens.desktop-session.v1","token":"short"}')
            with self.assertRaisesRegex(ImportFailure, "ログイン情報を読み込めません"):
                SessionStore(path).load()

    @unittest.skipIf(os.name == "nt", "Windows link creation requires elevated privileges")
    def test_session_store_does_not_follow_symbolic_link(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / "target.json"
            target.write_text('{"schema":"rootlens.desktop-session.v1","token":"' + "s" * 43 + '"}')
            path = root / "session.json"
            path.symlink_to(target)
            with self.assertRaisesRegex(ImportFailure, "ログイン情報を読み込めません"):
                SessionStore(path).load()

    def test_browser_login_returns_to_loopback_and_saves_only_rootlens_session(self):
        session, store = Session(), Store()
        account = RootLensAccount("http://127.0.0.1:3000", session=session, store=store)

        def browser(_authorization_url):
            start = session.requests[0][2]["json"]
            query = urlencode({"code": "authorization-code", "state": start["clientState"]})
            callback = start["redirectUri"] + "?" + query
            threading.Thread(target=lambda: urlopen(callback).read(), daemon=True).start()
            return True

        result = account.login(browser)
        self.assertEqual(result["sites"], [{"id": "site_test", "name": "試験"}])
        self.assertEqual(store.token, "s" * 43)
        token_request = session.requests[1][2]["json"]
        self.assertEqual(token_request["code"], "authorization-code")
        self.assertGreaterEqual(len(token_request["codeVerifier"]), 43)

    def test_saved_session_is_validated_by_rootlens_and_can_be_revoked(self):
        session, store = Session(), Store("s" * 43)
        account = RootLensAccount("http://127.0.0.1:3000", session=session, store=store)
        self.assertEqual(account.current()["sites"][0]["id"], "site_test")
        account.logout()
        self.assertIsNone(store.token)
        self.assertEqual(session.requests[-1][0], "DELETE")


if __name__ == "__main__":
    unittest.main()
