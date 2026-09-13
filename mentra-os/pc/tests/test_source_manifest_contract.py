import json
from pathlib import Path
import unittest

from rootlens_import.core import source_manifest_sha256


FIXTURE = Path(__file__).parents[3] / "fixtures" / "source-manifest-v1.json"


class SourceManifestContractTest(unittest.TestCase):
    def test_cross_runtime_fixture(self):
        fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
        files = {
            item["name"]: {"size": item["bytes"], "sha256": item["sha256"]}
            for item in fixture["files"]
        }
        self.assertEqual(source_manifest_sha256(fixture["unitId"], files), fixture["sha256"])


if __name__ == "__main__":
    unittest.main()
