from __future__ import annotations

import hashlib
from pathlib import Path
import tempfile
import unittest

from eos2_extract import (
    CHUNK_FOOTER,
    TYPE_CHUNK_END,
    TYPE_EVENT,
    TYPE_IMU_BATCH,
    TYPE_VIDEO_PAIR,
    VIDEO_PREFIX,
    FormatError,
    encode_record,
    extract,
)


class Eos2ExtractTest(unittest.TestCase):
    def build_chunk(self) -> bytes:
        records = [
            encode_record(
                TYPE_VIDEO_PAIR,
                10,
                1_000_000,
                VIDEO_PREFIX.pack(4, 5, 30_000) + b"LEFT" + b"RIGHT",
            ),
            encode_record(
                TYPE_IMU_BATCH,
                11,
                1_000_100,
                b"G0,A,FFFF,0002,8000,0003,FFFC,0005,0006,0007,0008,1E,2A;\n",
            ),
            encode_record(TYPE_EVENT, 12, 1_000_200, b'{"state":"recording"}'),
        ]
        body = b"".join(records)
        footer = CHUNK_FOOTER.pack(7, 10, 12, len(body), hashlib.sha256(body).digest())
        return body + encode_record(TYPE_CHUNK_END, 13, 1_000_300, footer)

    def test_extracts_verified_stereo_and_sensor_data(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "000007.eos2"
            output = root / "out"
            source.write_bytes(self.build_chunk())

            manifest = extract(source, output)

            self.assertEqual((output / "left.h264").read_bytes(), b"LEFT")
            self.assertEqual((output / "right.h264").read_bytes(), b"RIGHT")
            self.assertEqual(
                (output / "sensor-uart.log").read_bytes(),
                b"G0,A,FFFF,0002,8000,0003,FFFC,0005,0006,0007,0008,1E,2A;\n",
            )
            self.assertEqual(
                (output / "imu.csv").read_text(),
                "# index,ax,ay,az,gx,gy,gz,mx,my,mz,fsn,fsd\n"
                "10,-1,2,-32768,3,-4,5,6,7,8,30,42\n",
            )
            self.assertEqual(manifest["video_pairs"], 1)
            self.assertEqual(manifest["imu_samples"], 1)
            self.assertEqual(manifest["chunk_index"], 7)

    def test_rejects_corrupted_payload(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "bad.eos2"
            damaged = bytearray(self.build_chunk())
            damaged[42] ^= 0xFF
            source.write_bytes(damaged)
            with self.assertRaisesRegex(FormatError, "CRC mismatch"):
                extract(source, root / "out")

    def test_salvages_complete_records_before_truncated_tail(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "000008.eos2.partial"
            source.write_bytes(self.build_chunk()[:-20])
            output = root / "recovered"

            manifest = extract(source, output, salvage=True)

            self.assertTrue(manifest["recovered_from_partial"])
            self.assertEqual(manifest["video_pairs"], 1)
            self.assertEqual((output / "left.h264").read_bytes(), b"LEFT")


if __name__ == "__main__":
    unittest.main()
