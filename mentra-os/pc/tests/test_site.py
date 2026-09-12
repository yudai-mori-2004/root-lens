import tempfile
import os
from pathlib import Path
import unittest
from rootlens_import.core import ImportFailure
from rootlens_import.site import SiteProfile, load_site_profile, save_site_profile


class SiteProfileTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.profile = SiteProfile("test-site", "試験用事業所", "https://drive.google.com/drive/folders/TESTFOLDER00000")

    def test_profile_roundtrip_and_untrusted_url_rejection(self):
        path = self.root / "site.json"
        save_site_profile(self.profile, path)
        self.assertEqual(load_site_profile(path), self.profile)
        for url in ("http://drive.google.com/drive/folders/TESTFOLDER00000", "https://evil.example/drive/folders/TESTFOLDER00000", "file:///tmp/test", "https://drive.google.com@evil.example/drive/folders/TESTFOLDER00000"):
            with self.subTest(url=url), self.assertRaises(ImportFailure):
                save_site_profile(SiteProfile("test-site", "試験", url), path)
        self.assertEqual(load_site_profile(path), self.profile)


class ServiceAccountProfileTests(unittest.TestCase):
    def setUp(self):
        import copy
        from test_drive import KEY
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.key = copy.deepcopy(KEY)
        self.profile = SiteProfile("test-site", "試験", "https://drive.google.com/drive/folders/TESTFOLDER00000", service_account=self.key)

    def test_combined_configuration_is_private_and_repr_redacts_credentials(self):
        import json
        path = self.root / "rootlens-site.json"
        save_site_profile(self.profile, path)
        if os.name != "nt":
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(load_site_profile(path), self.profile)
        self.assertEqual(json.loads(path.read_text())["service_account"], self.key)
        self.assertNotIn("fixture-secret", repr(self.profile))
        path.chmod(0o644)
        save_site_profile(self.profile, path)
        if os.name != "nt":
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_rejects_external_account_and_non_google_token_endpoints(self):
        import copy
        from rootlens_import.site import validate_service_account
        for name, value in (("type", "external_account"), ("token_uri", "https://evil.example/token"),
                            ("token_uri", "https://oauth2.googleapis.com/token?other=1"),
                            ("client_email", "user@example.com"), ("universe_domain", "evil.example"),
                            ("private_key", "not-a-private-key")):
            key = copy.deepcopy(self.key)
            key[name] = value
            with self.subTest(name=name), self.assertRaises(ImportFailure) as caught:
                validate_service_account(key)
            self.assertNotIn("fixture-secret", str(caught.exception))
            self.assertNotIn("evil.example", str(caught.exception))

    def test_attach_google_key_file_without_echoing_malformed_json(self):
        import json
        from rootlens_import.site import attach_service_account
        base = SiteProfile("test-site", "試験", self.profile.approved_drive_url)
        keyfile = self.root / "key.json"
        keyfile.write_text(json.dumps(self.key))
        self.assertEqual(attach_service_account(base, keyfile), self.profile)
        keyfile.write_text('{"private_key":"secret-unfinished')
        with self.assertRaises(ImportFailure) as caught:
            attach_service_account(base, keyfile)
        self.assertNotIn("secret-unfinished", str(caught.exception))
        self.assertTrue(caught.exception.__suppress_context__)

    def test_rejects_linked_source_or_destination(self):
        from rootlens_import.site import attach_service_account
        path = self.root / "rootlens-site.json"
        save_site_profile(self.profile, path)
        source = self.root / "source.json"
        try:
            source.symlink_to(path)
        except OSError:
            self.skipTest("This machine does not allow symlinks")
        with self.assertRaises(ImportFailure):
            attach_service_account(self.profile, source)
        linked = self.root / "linked"
        linked.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ImportFailure):
            save_site_profile(self.profile, linked / "other.json")
        self.assertEqual(load_site_profile(path), self.profile)

    def test_atomic_write_failure_preserves_previous_key(self):
        from unittest.mock import patch
        path = self.root / "rootlens-site.json"
        save_site_profile(self.profile, path)
        with patch("rootlens_import.site.os.replace", side_effect=OSError("disk failure")):
            with self.assertRaises(OSError):
                save_site_profile(self.profile, path)
        self.assertEqual(load_site_profile(path), self.profile)
        self.assertEqual([p.name for p in self.root.iterdir()], ["rootlens-site.json"])
