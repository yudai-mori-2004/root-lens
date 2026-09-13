import hashlib
import json
from pathlib import Path
import re
import tempfile
import unittest

from rootlens_import.core import FILES, source_manifest_sha256
from rootlens_import.drive import DriveUploader, completed_unit_ids
from rootlens_import.site import SiteProfile
from unit_fixtures import unit_id


class Response:
    def __init__(self, status=200, headers=None):
        self.status_code = status
        self.headers = headers or {}

    def close(self):
        pass


class UploadHTTP:
    def __init__(self, gateway):
        self.gateway = gateway
        self.headers = []

    def request(self, method, url, **kwargs):
        self.headers.append(kwargs["headers"])
        session = self.gateway.sessions[url]
        content_range = kwargs["headers"]["Content-Range"]
        if content_range.startswith("bytes */"):
            if len(session["data"]) == session["size"]:
                return Response(200)
            return Response(308, {"Range": f"bytes=0-{len(session['data']) - 1}"} if session["data"] else {})
        match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", content_range)
        start, end, total = map(int, match.groups())
        self.assertions = (start == len(session["data"]), end - start + 1 == len(kwargs["data"]), total == session["size"])
        session["data"].extend(kwargs["data"])
        return Response(200 if len(session["data"]) == session["size"] else 308,
                        {"Range": f"bytes=0-{len(session['data']) - 1}"})

    def close(self):
        pass


class Gateway:
    def __init__(self):
        self.sessions = {}
        self.manifest = None
        self.folder_id = "drive-folder"

    def prepare_upload(self, identity, digest, files, approval_event_id):
        assert approval_event_id == "apv_test"
        self.manifest = (identity, digest, files)
        rows = []
        for name, info in files.items():
            url = f"https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id={name}"
            session = self.sessions.setdefault(url, {"size": info["size"], "data": bytearray()})
            complete = len(session["data"]) == session["size"]
            rows.append({"name": name, "complete": complete, "uploadUrl": None if complete else url})
        return {"attemptId": "upload-attempt", "folderId": self.folder_id, "files": rows}

    def verify_upload(self, attempt_id):
        self.asserted_attempt = attempt_id
        for name, info in self.manifest[2].items():
            url = f"https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id={name}"
            assert hashlib.sha256(self.sessions[url]["data"]).hexdigest() == info["sha256"]
        return {"unitId": self.manifest[0], "folderId": self.folder_id}

    def current_recordings(self, identities):
        if not self.manifest or self.manifest[0] not in identities:
            return []
        return [{"unitId": self.manifest[0], "folderId": self.folder_id,
                 "sourceManifestSha256": self.manifest[1],
                 "files": {name: {"id": "id-" + name, "size": info["size"], "sha256": info["sha256"]}
                           for name, info in self.manifest[2].items()}}]


class DriveUploadTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.identity = unit_id()
        self.recording = self.root / self.identity
        self.recording.mkdir()
        (self.recording / "rgb.mp4").write_bytes(b"video" * 100000)
        (self.recording / "frames.jsonl").write_text("{}\n")
        (self.recording / "imu.jsonl").write_text("{}\n")
        (self.recording / "metadata.json").write_text(json.dumps({
            "schema": "rootlens.mentra.raw.v1", "files": list(FILES), "unit_id": self.identity,
            "created_at": "2026-09-11T01:02:03.000Z",
        }))
        self.profile = SiteProfile("site_test", "試験")
        self.gateway = Gateway()
        self.http = UploadHTTP(self.gateway)
        self.uploader = DriveUploader(self.profile, self.root / "state", gateway=self.gateway,
                                      session=self.http, chunk_size=256 * 1024)

    def test_server_authorizes_destination_while_desktop_sends_only_bytes(self):
        result = self.uploader.upload_recording(self.recording, "apv_test")
        self.assertEqual(result.unit_id, self.identity)
        self.assertTrue(all("Authorization" not in headers for headers in self.http.headers))
        manifest = self.gateway.manifest[2]
        self.assertEqual(self.gateway.manifest[1], source_manifest_sha256(self.identity, manifest))
        self.assertEqual(completed_unit_ids(self.profile, self.root / "state"), {self.identity})

    def test_remote_observation_contains_the_integrity_record_used_for_device_cleanup(self):
        self.uploader.upload_recording(self.recording, "apv_test")
        recording = self.uploader.current_recordings({self.identity})[self.identity]
        self.assertEqual(recording.folder_id, "drive-folder")
        self.assertEqual(recording.source_manifest_sha256, self.gateway.manifest[1])
        self.assertEqual(set(recording.files), set(FILES))


if __name__ == "__main__":
    unittest.main()
