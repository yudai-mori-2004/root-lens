import json
from pathlib import Path
import unittest

from rootlens_import.core import unit_files_sha256


TEST_VECTOR = (
    Path(__file__).parents[2]
    / "tests"
    / "unit-files-v1.json"
)


class UnitFilesContractTest(unittest.TestCase):
    def test_cross_runtime_fixture(self):
        test_vector = json.loads(TEST_VECTOR.read_text(encoding="utf-8"))
        files = {
            item["path"]: {"size": item["bytes"], "sha256": item["sha256"]}
            for item in test_vector["files"]
        }
        self.assertEqual(
            unit_files_sha256(test_vector["unitId"], files),
            test_vector["sha256"],
        )


if __name__ == "__main__":
    unittest.main()
