import copy
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit

import requests

from rootlens_import.core import FILES, ImportCancelled, ImportFailure
from rootlens_import.drive import API, UPLOAD_API, FOLDER_MIME, DriveUploader, completed_hashes
from rootlens_import.site import SiteProfile
from rootlens_import.upload_state import state_directory

KEY = {"type": "service_account", "project_id": "test-project", "private_key_id": "test-key",
       "private_key": "-----BEGIN PRIVATE KEY-----\nfixture-secret\n-----END PRIVATE KEY-----\n",
       "client_email": "uploader@test-project.iam.gserviceaccount.com", "token_uri": "https://oauth2.googleapis.com/token"}


class Response:
    def __init__(self, status=200, body=None, headers=None):
        self.status_code = status
        self.value = {} if body is None else copy.deepcopy(body)
        self.headers = {} if headers is None else headers

    def json(self):
        return copy.deepcopy(self.value)

    def close(self):
        pass


class Credentials:
    def before_request(self, request, method, url, headers):
        headers["Authorization"] = "Bearer fake-test-token"


class DriveHTTP:
    def __init__(self):
        self.files = {"TESTFOLDER00000": {"id": "TESTFOLDER00000", "name": "承認済みデータ",
                     "mimeType": FOLDER_MIME, "driveId": "shared-drive", "trashed": False,
                     "capabilities": {"canAddChildren": True}}}
        self.sessions = {}
        self.next_id = 1
        self.calls = []
        self.writes = []
        self.lose_chunk_once = False
        self.lose_folder_once = False
        self.corrupt_file = None
        self.on_chunk = None
        self.no_progress = False
        self.forbid = False
        self.page_size = 1000

    def close(self):
        pass

    def request(self, method, url, **kwargs):
        self.calls.append((method, url, kwargs))
        assert kwargs["allow_redirects"] is False
        assert kwargs["timeout"] == (10, 30)
        if self.forbid:
            return Response(403, {"secret": "fixture-secret"})
        params = kwargs.get("params", {})
        if method == "GET" and url == API + "/files/generateIds":
            result = Response(body={"ids": [f"allocated-{self.next_id}"]})
            self.next_id += 1
            return result
        if method == "GET" and url == API + "/files":
            query = params["q"]
            parents = set(re.findall(r"'([^']+)' in parents", query))
            if len(parents) > 1 and params.get("corpora") == "drive":
                return Response(403, {"error": {"errors": [{"reason": "teamDriveMembershipRequired"}]}})
            properties = {}
            for key, value in re.findall(r"key='([^']+)' and value='([^']+)'", query):
                properties.setdefault(key, set()).add(value)
            values = [value for value in self.files.values()
                      if any(parent in parents for parent in value.get("parents", [])) and not value.get("trashed")
                      and all(value.get("appProperties", {}).get(k) in v for k, v in properties.items())]
            start = int(params.get("pageToken", "0"))
            count = min(self.page_size, params.get("pageSize", 100))
            body = {"files": values[start:start + count]}
            if start + count < len(values):
                body["nextPageToken"] = str(start + count)
            return Response(body=body)
        if method == "GET" and url.startswith(API + "/files/"):
            value = self.files.get(url.rsplit("/", 1)[-1])
            return Response(body=value) if value else Response(404)
        if method == "POST" and url == API + "/files":
            metadata = copy.deepcopy(kwargs["json"])
            if metadata["id"] in self.files:
                return Response(409)
            metadata.update(driveId="shared-drive", trashed=False)
            self.files[metadata["id"]] = metadata
            if self.lose_folder_once:
                self.lose_folder_once = False
                raise requests.ConnectionError("secret URL should not leak")
            return Response(body=metadata)
        if method == "POST" and url == UPLOAD_API:
            metadata = copy.deepcopy(kwargs["json"])
            if metadata["id"] in self.files:
                return Response(409)
            location = UPLOAD_API + "?uploadType=resumable&upload_id=" + str(len(self.sessions) + 1)
            self.sessions[location] = {"metadata": metadata, "data": bytearray(),
                                       "size": int(kwargs["headers"]["X-Upload-Content-Length"])}
            return Response(headers={"Location": location})
        if method == "PUT":
            assert "Authorization" not in kwargs["headers"]
            session = self.sessions.get(url)
            if session is None:
                return Response(404)
            data = session["data"]
            size = session["size"]
            content_range = kwargs["headers"]["Content-Range"]
            if content_range.startswith("bytes */"):
                if len(data) == size:
                    return Response(body=self.files[session["metadata"]["id"]])
                return Response(308, headers={"Range": f"bytes=0-{len(data)-1}"} if data else {})
            match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", content_range)
            start, end, total = map(int, match.groups())
            assert start == len(data)
            assert len(kwargs["data"]) == end - start + 1
            assert total == size
            if self.no_progress:
                return Response(308, headers={"Range": f"bytes=0-{len(data)-1}"} if data else {})
            data.extend(kwargs["data"])
            filename = session["metadata"]["name"]
            self.writes.append((filename, start, len(kwargs["data"])))
            if len(data) == size:
                metadata = copy.deepcopy(session["metadata"])
                metadata.update(driveId="shared-drive", trashed=False, mimeType="application/octet-stream",
                                size=str(size), sha256Checksum=hashlib.sha256(data).hexdigest())
                if filename == self.corrupt_file:
                    metadata["sha256Checksum"] = "0" * 64
                self.files[metadata["id"]] = metadata
            if self.on_chunk:
                self.on_chunk(filename, len(data))
            if self.lose_chunk_once:
                self.lose_chunk_once = False
                raise requests.ConnectionError("session URL secret")
            if len(data) == size:
                return Response(body=self.files[session["metadata"]["id"]])
            return Response(308, headers={"Range": f"bytes=0-{len(data)-1}"})
        raise AssertionError((method, url))


class DriveUploadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.video = b"v" * (600 * 1024)
        self.content_hash = hashlib.sha256(self.video).hexdigest()
        self.path = self.root / ("rec-20260911T010203.000Z-" + self.content_hash[:12])
        self.path.mkdir()
        (self.path / "rgb.mp4").write_bytes(self.video)
        for name in ("frames.jsonl", "imu.jsonl"):
            (self.path / name).write_bytes(b"{}\n")
        (self.path / "metadata.json").write_text(json.dumps({"schema": "rootlens.mentra.raw.v1",
                    "content_hash": self.content_hash, "files": list(FILES), "created_at": "2026-09-11T01:02:03.000Z"}))
        self.profile = SiteProfile("test-site", "試験", "https://drive.google.com/drive/folders/TESTFOLDER00000", service_account=copy.deepcopy(KEY))
        self.http = DriveHTTP()
        self.states = self.root / "states"

    def uploader(self, base=None):
        uploader = DriveUploader(self.profile, base or self.states, session=self.http,
                                 credentials=Credentials(), chunk_size=256 * 1024)
        uploader._wait = lambda _: None
        return uploader

    def state_file(self):
        return state_directory(self.profile, self.states) / (self.content_hash + ".json")

    def test_complete_only_after_every_remote_file_verified_and_deduplicate_restart(self):
        events = []
        result = self.uploader().upload_recording(self.path, on_progress=events.append)
        self.assertEqual(result.content_hash, self.content_hash)
        self.assertEqual(events[-1].state, "completed")
        self.assertEqual(events[-1].bytes_uploaded, events[-1].total_bytes)
        self.assertIn("verifying_remote", [item.state for item in events[:-1]])
        self.assertEqual(completed_hashes(self.profile, self.states), {self.content_hash})
        self.assertEqual(set(p.name for p in self.path.iterdir()), set(FILES))
        self.assertEqual(len(self.http.files), 6)
        writes = len(self.http.writes)
        self.uploader().upload_recording(self.path)
        self.assertEqual(len(self.http.writes), writes)
        self.assertEqual(len(self.http.files), 6)
        if os.name != "nt":
            self.assertEqual(self.state_file().stat().st_mode & 0o777, 0o600)

    def test_discover_completed_recording_without_local_journal(self):
        self.uploader().upload_recording(self.path)
        writes = len(self.http.writes)
        self.uploader(self.root / "other-pc").upload_recording(self.path)
        self.assertEqual(len(self.http.writes), writes)
        self.assertEqual(len(self.http.files), 6)

    def test_accepted_chunk_with_lost_response_resumes_at_server_offset(self):
        self.http.lose_chunk_once = True
        self.uploader().upload_recording(self.path)
        writes = [item for item in self.http.writes if item[0] == "rgb.mp4"]
        self.assertEqual([item[1] for item in writes], [0, 256 * 1024, 512 * 1024])
        self.assertEqual(completed_hashes(self.profile, self.states), {self.content_hash})

    def test_cancel_then_restart_reuses_partial_session_without_duplicate(self):
        cancel = threading.Event()
        self.http.on_chunk = lambda *_: cancel.set()
        with self.assertRaises(ImportCancelled):
            self.uploader().upload_recording(self.path, cancel_event=cancel)
        self.assertEqual(completed_hashes(self.profile, self.states), set())
        state = json.loads(self.state_file().read_text())
        session = state["files"]["rgb.mp4"]["session"]
        self.assertIsNotNone(session)
        self.http.on_chunk = None
        self.uploader().upload_recording(self.path)
        writes = [item for item in self.http.writes if item[0] == "rgb.mp4"]
        self.assertEqual([item[1] for item in writes], [0, 256 * 1024, 512 * 1024])
        self.assertEqual(len(self.http.files), 6)

    def test_lost_folder_response_reuses_preallocated_id(self):
        self.http.lose_folder_once = True
        self.uploader().upload_recording(self.path)
        self.assertEqual(len(self.http.files), 6)

    def test_remote_checksum_mismatch_does_not_mark_complete_or_overwrite(self):
        self.http.corrupt_file = "imu.jsonl"
        with self.assertRaisesRegex(ImportFailure, "一致しません"):
            self.uploader().upload_recording(self.path)
        self.assertEqual(completed_hashes(self.profile, self.states), set())
        count = len(self.http.writes)
        with self.assertRaises(ImportFailure):
            self.uploader().upload_recording(self.path)
        self.assertEqual(len(self.http.writes), count)
        self.assertEqual((self.path / "rgb.mp4").read_bytes(), self.video)

    def test_local_checksum_mismatch_stops_before_network(self):
        (self.path / "rgb.mp4").write_bytes(b"changed")
        with self.assertRaises(ImportFailure):
            self.uploader().upload_recording(self.path)
        self.assertEqual(self.http.calls, [])

    def test_local_change_after_first_attempt_fails_before_network(self):
        self.http.corrupt_file = "imu.jsonl"
        with self.assertRaises(ImportFailure):
            self.uploader().upload_recording(self.path)
        self.http.calls.clear()
        (self.path / "frames.jsonl").write_bytes(b"changed")
        with self.assertRaisesRegex(ImportFailure, "変わっています"):
            self.uploader().upload_recording(self.path)
        self.assertEqual(self.http.calls, [])

    def test_untrusted_saved_session_url_is_never_contacted(self):
        cancel = threading.Event()
        self.http.on_chunk = lambda *_: cancel.set()
        with self.assertRaises(ImportCancelled):
            self.uploader().upload_recording(self.path, cancel_event=cancel)
        state = json.loads(self.state_file().read_text())
        state["files"]["rgb.mp4"]["session"] = "https://evil.example/upload"
        self.state_file().write_text(json.dumps(state))
        self.http.on_chunk = None
        with self.assertRaisesRegex(ImportFailure, "再開するための情報"):
            self.uploader().upload_recording(self.path)
        self.assertTrue(all(urlsplit(url).netloc == "www.googleapis.com" for _, url, _ in self.http.calls))

    def test_shared_drive_and_add_permission_required(self):
        for field in ("driveId", "capabilities"):
            with self.subTest(field=field):
                original = self.http.files["TESTFOLDER00000"].pop(field)
                with self.assertRaisesRegex(ImportFailure, "共有設定"):
                    self.uploader().upload_recording(self.path)
                self.http.files["TESTFOLDER00000"][field] = original
        self.assertEqual(self.http.writes, [])

    def test_duplicate_remote_identity_stops_before_upload(self):
        self.uploader().upload_recording(self.path)
        folder = next(v for v in self.http.files.values() if v.get("appProperties", {}).get("rootlens_kind") == "recording")
        duplicate = copy.deepcopy(folder)
        duplicate["id"] = "duplicate"
        self.http.files["duplicate"] = duplicate
        with self.assertRaisesRegex(ImportFailure, "複数"):
            self.uploader(self.root / "new-pc").upload_recording(self.path)

    def test_nonprogress_and_http_failures_are_bounded_and_secret_free(self):
        self.http.no_progress = True
        with self.assertRaisesRegex(ImportFailure, "進んでいません"):
            self.uploader().upload_recording(self.path)
        self.assertLess(len(self.http.calls), 30)
        self.http.forbid = True
        with self.assertRaises(ImportFailure) as caught:
            self.uploader().upload_recording(self.path)
        self.assertNotIn("fixture-secret", str(caught.exception))
        self.assertNotIn("https://", str(caught.exception))

    def test_cancel_at_full_bytes_before_final_checks_never_completes(self):
        cancel = threading.Event()
        def progress(event):
            if event.state == "verifying_remote" and event.file_name == "":
                cancel.set()
        with self.assertRaises(ImportCancelled):
            self.uploader().upload_recording(self.path, on_progress=progress, cancel_event=cancel)
        self.assertEqual(completed_hashes(self.profile, self.states), set())

    def test_malformed_complete_state_is_not_used_to_hide_recording(self):
        self.uploader().upload_recording(self.path)
        value = json.loads(self.state_file().read_text())
        value["files"]["imu.jsonl"]["verified"] = False
        self.state_file().write_text(json.dumps(value))
        self.assertEqual(completed_hashes(self.profile, self.states), set())

    def test_state_and_credentials_do_not_cross_site_or_destination(self):
        self.uploader().upload_recording(self.path)
        other = SiteProfile("other-site", "他", self.profile.approved_drive_url, service_account=copy.deepcopy(KEY))
        self.assertEqual(completed_hashes(other, self.states), set())
        other_account = copy.deepcopy(KEY)
        other_account["client_email"] = "other@test-project.iam.gserviceaccount.com"
        other = SiteProfile(self.profile.site_id, "他", self.profile.approved_drive_url, service_account=other_account)
        self.assertEqual(completed_hashes(other, self.states), set())

    def test_expired_partial_session_restarts_with_same_file_id(self):
        cancel = threading.Event()
        self.http.on_chunk = lambda *_: cancel.set()
        with self.assertRaises(ImportCancelled):
            self.uploader().upload_recording(self.path, cancel_event=cancel)
        before = json.loads(self.state_file().read_text())["files"]["rgb.mp4"]["id"]
        self.http.sessions.clear()
        self.http.on_chunk = None
        self.uploader().upload_recording(self.path)
        after = json.loads(self.state_file().read_text())["files"]["rgb.mp4"]["id"]
        self.assertEqual(before, after)
        self.assertEqual(len(self.http.files), 6)

    def test_final_duplicate_check_also_applies_to_saved_folder(self):
        self.uploader().upload_recording(self.path)
        folder = next(v for v in self.http.files.values() if v.get("appProperties", {}).get("rootlens_kind") == "recording")
        duplicate = copy.deepcopy(folder)
        duplicate["id"] = "duplicate"
        self.http.files["duplicate"] = duplicate
        with self.assertRaisesRegex(ImportFailure, "複数"):
            self.uploader().upload_recording(self.path)
        self.assertEqual(completed_hashes(self.profile, self.states), set())

    def test_changed_file_during_upload_cannot_complete(self):
        def progress(event):
            if event.state == "uploading" and event.file_name == "rgb.mp4" and event.bytes_uploaded == 0:
                (self.path / "frames.jsonl").write_bytes(b"changed")
        with self.assertRaises(ImportFailure):
            self.uploader().upload_recording(self.path, on_progress=progress)
        self.assertEqual(completed_hashes(self.profile, self.states), set())

    def test_network_retry_is_bounded_and_preserves_no_completion(self):
        uploader = self.uploader()
        with patch.object(self.http, "request", side_effect=requests.Timeout("secret-token-and-url")) as request:
            with self.assertRaises(ImportFailure) as caught:
                uploader.upload_recording(self.path)
        self.assertEqual(request.call_count, 4)
        self.assertNotIn("secret-token", str(caught.exception))
        self.assertTrue(caught.exception.__suppress_context__)
        self.assertEqual(completed_hashes(self.profile, self.states), set())

    def test_real_google_auth_signs_ephemeral_key_and_refreshes_token(self):
        import base64
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding, rsa
        from urllib.parse import parse_qs
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        info = copy.deepcopy(KEY)
        info["private_key"] = key.private_bytes(serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
        profile = SiteProfile("test-site", "試験", self.profile.approved_drive_url, service_account=info)
        original_request = self.http.request
        token_calls = []
        def request(method, url, **kwargs):
            if url != "https://oauth2.googleapis.com/token":
                self.assertEqual(kwargs["headers"]["authorization"], "Bearer ephemeral-test-access")
                return original_request(method, url, **kwargs)
            token_calls.append(1)
            self.assertEqual((method, kwargs["timeout"], kwargs["allow_redirects"]), ("POST", (10, 30), False))
            body = kwargs["data"]
            form = parse_qs(body.decode() if isinstance(body, bytes) else body)
            self.assertEqual(form["grant_type"], ["urn:ietf:params:oauth:grant-type:jwt-bearer"])
            jwt = form["assertion"][0]
            head, payload, signature = jwt.split(".")
            decode = lambda value: base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
            key.public_key().verify(decode(signature), (head + "." + payload).encode(), padding.PKCS1v15(), hashes.SHA256())
            claims = json.loads(decode(payload))
            self.assertEqual(claims["iss"], info["client_email"])
            self.assertEqual(claims["scope"], "https://www.googleapis.com/auth/drive")
            self.assertEqual(claims["aud"], "https://oauth2.googleapis.com/token")
            response = requests.Response()
            response.status_code = 200
            response._content = json.dumps({"access_token": "ephemeral-test-access", "expires_in": 3600,
                                           "token_type": "Bearer"}).encode()
            return response
        with patch.object(self.http, "request", side_effect=request):
            uploader = DriveUploader(profile, self.states, session=self.http)
            self.assertEqual(uploader.validate_destination()["id"], "TESTFOLDER00000")
            uploader.validate_destination()
        self.assertEqual(len(token_calls), 1)
        self.assertEqual(len(self.http.files), 1)

    def current_fixture(self, index=0):
        content_hash = self.content_hash if index == 0 else hashlib.sha256(str(index).encode()).hexdigest()
        folder_id = f"current-folder-{index}"
        properties = {"rootlens_site": self.profile.site_id, "rootlens_hash": content_hash,
                      "rootlens_kind": "recording"}
        folder = {"id": folder_id, "name": "rec-20260911T010203.000Z-" + content_hash[:12],
                  "mimeType": FOLDER_MIME, "driveId": "shared-drive", "trashed": False,
                  "parents": ["TESTFOLDER00000"], "appProperties": properties}
        self.http.files[folder_id] = folder
        manifest = {}
        for filename in FILES:
            payload = (self.path / filename).read_bytes()
            sha256 = content_hash if filename == "rgb.mp4" else hashlib.sha256(payload).hexdigest()
            file_id = folder_id + "-" + filename.replace(".", "-")
            self.http.files[file_id] = {"id": file_id, "name": filename, "parents": [folder_id],
                "mimeType": "application/octet-stream", "driveId": "shared-drive", "trashed": False,
                "size": str(len(payload)), "sha256Checksum": sha256,
                "appProperties": {**properties, "rootlens_kind": "file", "rootlens_file": filename}}
            manifest[filename] = {"size": len(payload), "sha256": sha256}
        return content_hash, folder, manifest

    def test_current_drive_state_without_journal_is_read_only_and_batched(self):
        hashes = {self.current_fixture(index)[0] for index in range(20)}
        before = copy.deepcopy(self.http.files)
        values = self.uploader().current_recordings(hashes)
        self.assertEqual(set(values), hashes)
        self.assertEqual(len(self.http.calls), 5)
        self.assertTrue(all(method == "GET" for method, _, _ in self.http.calls))
        lists = [options["params"] for _, url, options in self.http.calls if url == API + "/files"]
        self.assertTrue(all(params["corpora"] == "user" and "driveId" not in params for params in lists))
        self.assertEqual(before, self.http.files)
        self.assertFalse(self.states.exists())
        self.assertEqual(set(values[self.content_hash].files), set(FILES))
        self.assertIsInstance(values[self.content_hash].files["rgb.mp4"]["size"], int)

    def test_current_drive_state_requires_valid_targets_and_empty_targets_do_not_connect(self):
        uploader = self.uploader()
        for empty in (set(), [], (), frozenset()):
            self.assertEqual(uploader.current_recordings(empty), {})
        with self.assertRaises(TypeError):
            uploader.current_recordings()
        for invalid in (None, self.content_hash, {"short"}, {self.content_hash.upper()}, {123},
                        [[self.content_hash]], {self.content_hash + "\n"}, {"' or trashed = true"}):
            with self.subTest(targets=invalid):
                with self.assertRaises(ImportFailure):
                    uploader.current_recordings(invalid)
        self.assertEqual(self.http.calls, [])

    def test_current_drive_state_queries_only_requested_hashes_and_their_children(self):
        fixtures = [self.current_fixture(index) for index in range(80)]
        target = fixtures[23][0]
        values = self.uploader().current_recordings({target})
        self.assertEqual(set(values), {target})
        self.assertEqual(len(self.http.calls), 5)
        queries = [options["params"]["q"] for _, url, options in self.http.calls if url == API + "/files"]
        folder_query, child_query, confirmed_folder_query = queries
        self.assertEqual(folder_query, confirmed_folder_query)
        self.assertIn("'TESTFOLDER00000' in parents", folder_query)
        self.assertIn("key='rootlens_site' and value='test-site'", folder_query)
        self.assertIn("key='rootlens_kind' and value='recording'", folder_query)
        self.assertEqual(re.findall(r"key='rootlens_hash' and value='([^']+)'", folder_query), [target])
        self.assertEqual(re.findall(r"'([^']+)' in parents", child_query), [fixtures[23][1]["id"]])
        self.http.calls.clear()
        self.assertEqual(self.uploader().current_recordings({"0" * 64}), {})
        self.assertEqual(len(self.http.calls), 2)

    def test_current_drive_state_discards_out_of_target_folder_response(self):
        self.current_fixture()
        _, other, _ = self.current_fixture(1)
        original = self.http.request
        def request(method, url, **options):
            response = original(method, url, **options)
            if url == API + "/files" and "rootlens_hash" in options["params"]["q"]:
                response.value["files"].append(copy.deepcopy(other))
            return response
        with patch.object(self.http, "request", side_effect=request):
            self.assertEqual(set(self.uploader().current_recordings({self.content_hash})), {self.content_hash})
        child_queries = [options["params"]["q"] for _, url, options in self.http.calls
                         if url == API + "/files" and "rootlens_hash" not in options["params"]["q"]]
        self.assertNotIn("'current-folder-1' in parents", " ".join(child_queries))

    def test_current_drive_state_returns_all_four_current_checksums_and_sizes(self):
        content_hash, _, manifest = self.current_fixture()
        result = self.uploader().current_recordings({self.content_hash})[content_hash]
        for filename in FILES:
            self.assertEqual(result.files[filename]["sha256"], manifest[filename]["sha256"])
            self.assertEqual(result.files[filename]["size"], manifest[filename]["size"])
            self.assertIsInstance(result.files[filename]["id"], str)

    def test_current_drive_state_does_not_trust_completed_local_receipt(self):
        self.uploader().upload_recording(self.path)
        receipt = self.state_file().read_bytes()
        file_id = next(key for key, value in self.http.files.items() if value.get("name") == "imu.jsonl")
        del self.http.files[file_id]
        self.http.calls.clear()
        self.assertEqual(self.uploader().current_recordings({self.content_hash}), {})
        self.assertEqual(self.state_file().read_bytes(), receipt)
        self.assertTrue(all(method == "GET" for method, _, _ in self.http.calls))

    def test_current_drive_state_reports_current_bytes_independently_of_local_history(self):
        content_hash, _, _ = self.current_fixture()
        imu = next(value for value in self.http.files.values() if value.get("name") == "imu.jsonl")
        imu["sha256Checksum"] = hashlib.sha256(b"different current data").hexdigest()
        current = self.uploader().current_recordings({self.content_hash})[content_hash]
        self.assertEqual(current.files["imu.jsonl"]["sha256"], imu["sha256Checksum"])
        self.assertEqual(self.uploader(self.root / "another-pc").current_recordings({self.content_hash})[content_hash], current)

    def test_current_drive_state_excludes_deleted_moved_or_trashed_folders(self):
        for change in ("deleted", "moved", "trashed"):
            with self.subTest(change=change):
                self.http = DriveHTTP()
                _, folder, _ = self.current_fixture()
                if change == "deleted":
                    del self.http.files[folder["id"]]
                elif change == "moved":
                    folder["parents"] = ["elsewhere"]
                else:
                    folder["trashed"] = True
                self.assertEqual(self.uploader().current_recordings({self.content_hash}), {})

    def test_current_drive_state_rechecks_folder_after_reading_children(self):
        for change in ("moved", "trashed", "duplicate", "replaced"):
            with self.subTest(change=change):
                self.http = DriveHTTP()
                _, folder, _ = self.current_fixture()
                original = self.http.request
                def request(method, url, **options):
                    response = original(method, url, **options)
                    if "'current-folder-0' in parents" in options.get("params", {}).get("q", ""):
                        if change == "moved":
                            folder["parents"] = ["elsewhere"]
                        elif change == "trashed":
                            folder["trashed"] = True
                        else:
                            replacement = copy.deepcopy(folder)
                            replacement["id"] = "replacement-folder"
                            self.http.files[replacement["id"]] = replacement
                            if change == "replaced":
                                del self.http.files[folder["id"]]
                    return response
                with patch.object(self.http, "request", side_effect=request):
                    self.assertEqual(self.uploader().current_recordings({self.content_hash}), {})

    def test_current_drive_state_rechecks_destination_after_reading_children(self):
        self.current_fixture()
        original = self.http.request
        def request(method, url, **options):
            response = original(method, url, **options)
            if "'current-folder-0' in parents" in options.get("params", {}).get("q", ""):
                self.http.files["TESTFOLDER00000"]["parents"] = ["moved-site"]
            return response
        with patch.object(self.http, "request", side_effect=request):
            with self.assertRaises(ImportFailure):
                self.uploader().current_recordings({self.content_hash})

    def test_current_drive_state_excludes_incomplete_or_invalid_files(self):
        changes = {"missing": None, "trashed": True, "parents": ["elsewhere"],
                   "size": "0", "sha256Checksum": "not-a-checksum", "driveId": "other-drive",
                   "mimeType": "application/vnd.google-apps.document", "appProperties": {}}
        for field, invalid in changes.items():
            with self.subTest(field=field):
                self.http = DriveHTTP()
                self.current_fixture()
                key = next(key for key, value in self.http.files.items() if value.get("name") == "metadata.json")
                if field == "missing":
                    del self.http.files[key]
                else:
                    self.http.files[key][field] = invalid
                self.assertEqual(self.uploader().current_recordings({self.content_hash}), {})

    def test_current_drive_state_excludes_video_identity_mismatch(self):
        self.current_fixture()
        video = next(value for value in self.http.files.values() if value.get("name") == "rgb.mp4")
        video["sha256Checksum"] = "0" * 64
        self.assertEqual(self.uploader().current_recordings({self.content_hash}), {})

    def test_current_drive_state_excludes_duplicate_folders_and_files(self):
        for duplicate_kind in ("recording", "file"):
            with self.subTest(kind=duplicate_kind):
                self.http = DriveHTTP()
                self.current_fixture()
                duplicate = copy.deepcopy(next(value for value in self.http.files.values()
                    if value.get("appProperties", {}).get("rootlens_kind") == duplicate_kind))
                duplicate["id"] = "duplicate-current"
                self.http.files[duplicate["id"]] = duplicate
                self.assertEqual(self.uploader().current_recordings({self.content_hash}), {})

    def test_current_drive_state_excludes_other_sites_and_misnamed_folders(self):
        for field, invalid in (("appProperties", {"rootlens_kind": "recording", "rootlens_hash": self.content_hash,
                "rootlens_site": "another-site"}), ("name", "rec-20260911T010203.000Z-000000000000")):
            with self.subTest(field=field):
                self.http = DriveHTTP()
                _, folder, _ = self.current_fixture()
                folder[field] = invalid
                self.assertEqual(self.uploader().current_recordings({self.content_hash}), {})

    def test_current_drive_state_follows_pages_and_splits_parent_groups(self):
        hashes = {self.current_fixture(index)[0] for index in range(41)}
        self.http.page_size = 7
        self.assertEqual(set(self.uploader().current_recordings(hashes)), hashes)
        children_queries = {options["params"]["q"] for _, url, options in self.http.calls
                            if url == API + "/files" and "current-folder-" in options["params"]["q"]}
        self.assertEqual(len(children_queries), 3)
        self.assertTrue(all(len(re.findall(r"'([^']+)' in parents", query)) <= 20 for query in children_queries))
        folder_queries = {options["params"]["q"] for _, url, options in self.http.calls
                          if url == API + "/files" and "rootlens_hash" in options["params"]["q"]}
        self.assertEqual(len(folder_queries), 3)
        requested = set()
        for query in folder_queries:
            batch = re.findall(r"key='rootlens_hash' and value='([^']+)'", query)
            self.assertLessEqual(len(batch), 20)
            requested.update(batch)
        self.assertEqual(requested, hashes)

    def test_current_drive_state_rejects_partial_and_looping_list_responses(self):
        self.current_fixture()
        original = self.http.request
        for malformed in ({"files": [], "incompleteSearch": True}, {"files": "bad"},
                          {"files": [], "nextPageToken": "repeated"}):
            with self.subTest(response=malformed):
                def request(method, url, **options):
                    return Response(body=malformed) if url == API + "/files" else original(method, url, **options)
                with patch.object(self.http, "request", side_effect=request) as calls:
                    with self.assertRaises(ImportFailure):
                        self.uploader().current_recordings({self.content_hash})
                    self.assertLessEqual(calls.call_count, 3)

    def test_current_drive_state_can_cancel_and_read_without_write_permission(self):
        self.current_fixture()
        self.http.files["TESTFOLDER00000"]["capabilities"] = {"canAddChildren": False}
        self.assertEqual(set(self.uploader().current_recordings({self.content_hash})), {self.content_hash})
        self.http.calls.clear()
        cancel = threading.Event()
        cancel.set()
        with self.assertRaises(ImportCancelled):
            self.uploader().current_recordings({self.content_hash}, cancel_event=cancel)
        self.assertEqual(self.http.calls, [])

    def test_current_drive_state_never_returns_partial_results_after_network_failure(self):
        self.current_fixture()
        original = self.http.request
        def request(method, url, **options):
            if "current-folder-" in options.get("params", {}).get("q", ""):
                return Response(403, {"secret": "fixture-secret"})
            return original(method, url, **options)
        with patch.object(self.http, "request", side_effect=request):
            with self.assertRaises(ImportFailure) as caught:
                self.uploader().current_recordings({self.content_hash})
        self.assertNotIn("fixture-secret", str(caught.exception))
        self.assertFalse(self.states.exists())
