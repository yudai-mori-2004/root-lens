import unittest
from mjpeg_budget import analyze


def fixture(n=300, size=100_000):
    return {"streams": [{"codec_name": "mjpeg", "width": 2560, "height": 720}],
            "packets": [{"pts_time": str(i / 30), "size": str(size)} for i in range(n)]}


class BudgetTests(unittest.TestCase):
    def test_constant_rate(self):
        result = analyze(fixture(), 32)
        self.assertAlmostEqual(result["mean_mbps"], 24)
        self.assertAlmostEqual(result["one_second_mbps_max"], 24)
        self.assertAlmostEqual(result["peak_buffer_mib"], 100_000 / 2**20)
        self.assertFalse(result["buffer_overflow"])

    def test_sustained_deficit(self):
        result = analyze(fixture(n=600), 16)
        self.assertTrue(result["buffer_overflow"])
        self.assertGreater(result["end_backlog_mib"], 16)

    def test_outage_requires_storage(self):
        result = analyze(fixture(), 32, outages=[(1, 8)])
        self.assertTrue(result["buffer_overflow"])
        self.assertGreater(result["peak_buffer_mib"], 20)

    def test_outage_recovers(self):
        result = analyze(fixture(n=600), 48, outages=[(1, 2)])
        self.assertFalse(result["buffer_overflow"])
        self.assertAlmostEqual(result["end_backlog_mib"], 100_000 / 2**20)

    def test_burst_above_average(self):
        data = fixture(n=600, size=50_000)
        for p in data["packets"][150:180]:
            p["size"] = str(1_000_000)
        result = analyze(data, 32)
        self.assertLess(result["mean_mbps"], 32)
        self.assertTrue(result["buffer_overflow"])

    def test_duplicate_time_rejected(self):
        data = fixture()
        data["packets"][1]["pts_time"] = "0"
        with self.assertRaises(ValueError):
            analyze(data, 32)

    def test_wrong_codec_rejected(self):
        data = fixture()
        data["streams"][0]["codec_name"] = "h264"
        with self.assertRaises(ValueError):
            analyze(data, 32)

    def test_overlapping_outages_rejected(self):
        with self.assertRaises(ValueError):
            analyze(fixture(), 32, outages=[(1, 3), (2, 4)])


if __name__ == "__main__":
    unittest.main()
