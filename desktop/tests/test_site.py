import json
from pathlib import Path
import tempfile
import unittest

from rootlens_import.core import ImportFailure
from rootlens_import.site import SiteProfile, load_site_profile, save_site_profile


class SiteProfileTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.path = Path(self.temporary.name) / "site.json"

    def test_authenticated_site_selection_roundtrip_contains_no_secret(self):
        profile = SiteProfile("site_test", "試験用事業所")
        save_site_profile(profile, self.path)
        self.assertEqual(load_site_profile(self.path), profile)
        text = self.path.read_text()
        self.assertNotIn("token", text)
        self.assertNotIn("drive", text.lower())

    def test_rejects_the_old_secret_bearing_configuration(self):
        self.path.write_text(json.dumps({
            "schema": "rootlens.site.v1",
            "site_id": "test-site",
            "service_account": {"private_key": "secret"},
        }))
        with self.assertRaises(ImportFailure) as caught:
            load_site_profile(self.path)
        self.assertNotIn("secret", str(caught.exception))

    def test_rejects_an_untrusted_api_origin(self):
        with self.assertRaises(ImportFailure):
            save_site_profile(SiteProfile("site_test", "試験", "https://example.com"), self.path)


if __name__ == "__main__":
    unittest.main()
