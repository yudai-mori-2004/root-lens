import json
from pathlib import Path
import unittest

from rootlens_import.core import source_manifest_sha256


TEST_VECTOR = (
    Path(__file__).parents[2]
    / "tests"
    / "source-manifest-v1.json"
)


class SourceManifestContractTest(unittest.TestCase):
    def test_cross_runtime_fixture(self):
        test_vector = json.loads(TEST_VECTOR.read_text(encoding="utf-8"))
        files = {
            item["name"]: {"size": item["bytes"], "sha256": item["sha256"]}
            for item in test_vector["files"]
        }
        self.assertEqual(
            source_manifest_sha256(test_vector["unitId"], files),
            test_vector["sha256"],
        )


if __name__ == "__main__":
    unittest.main()
