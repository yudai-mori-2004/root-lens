#!/usr/bin/env python3
"""Estimate lossless MJPEG forwarding/storage budgets from ffprobe packet data."""
import argparse
from collections import deque
import json
import math
from pathlib import Path


def percentile(values, p):
    values = sorted(values)
    return values[max(0, math.ceil(len(values) * p) - 1)]


def analyze(data, service_mbps, buffer_mib=16, outages=()):
    if not math.isfinite(service_mbps) or service_mbps <= 0:
        raise ValueError("service_mbps must be positive and finite")
    if not math.isfinite(buffer_mib) or buffer_mib <= 0:
        raise ValueError("buffer_mib must be positive and finite")
    streams = data.get("streams", [])
    if len(streams) != 1 or streams[0].get("codec_name") != "mjpeg":
        raise ValueError("select exactly one MJPEG video stream in ffprobe")
    stream = streams[0]
    if (stream.get("width"), stream.get("height")) != (2560, 720):
        raise ValueError("expected OSCAR 2560x720 stereo stream")
    packets = data.get("packets", [])
    if len(packets) < 2:
        raise ValueError("at least two packets are required")
    rows = [(float(p["pts_time"]), int(p["size"])) for p in packets]
    if any(not math.isfinite(t) or size <= 0 for t, size in rows):
        raise ValueError("invalid packet time or size")
    if any(b[0] <= a[0] for a, b in zip(rows, rows[1:])):
        raise ValueError("packet PTS must increase strictly; do not hide duplicates/reordering")
    origin = rows[0][0]
    rows = [(t - origin, n) for t, n in rows]
    outages = sorted(outages)
    for i, (a, b) in enumerate(outages):
        if not (math.isfinite(a) and math.isfinite(b) and 0 <= a < b):
            raise ValueError("outages must have finite 0 <= start < end")
        if i and a < outages[i - 1][1]:
            raise ValueError("outages must not overlap")
    duration = rows[-1][0] + 1 / 30
    total = sum(n for _, n in rows)
    rate = service_mbps * 1e6 / 8
    backlog = peak = window_bytes = 0
    previous = 0.0
    window = deque()
    window_rates = []
    for t, size in rows:
        blocked = sum(max(0, min(t, b) - max(previous, a)) for a, b in outages)
        backlog = max(0, backlog - rate * max(0, t - previous - blocked)) + size
        peak = max(peak, backlog)
        previous = t
        window.append((t, size))
        window_bytes += size
        while window and window[0][0] <= t - 1.0 + 1e-9:
            window_bytes -= window.popleft()[1]
        if t >= 1.0 - 1e-9:
            window_rates.append(window_bytes * 8 / 1e6)
    gaps = [b[0] - a[0] for a, b in zip(rows, rows[1:])]
    sizes = [n for _, n in rows]
    mean = total * 8 / duration / 1e6
    return {
        "frames": len(rows), "duration_seconds": duration,
        "observed_fps": len(rows) / duration,
        "mean_mbps": mean,
        "frame_bytes_p95": percentile(sizes, .95),
        "frame_bytes_p99": percentile(sizes, .99),
        "frame_bytes_max": max(sizes),
        "one_second_mbps_p99": percentile(window_rates, .99) if window_rates else None,
        "one_second_mbps_max": max(window_rates) if window_rates else None,
        "pts_gaps_over_50ms": sum(g > .050 for g in gaps),
        "service_mbps_assumed": service_mbps,
        "service_margin_over_mean": service_mbps / mean,
        "recommended_min_service_mbps_1_5x": mean * 1.5,
        "peak_buffer_mib": peak / 2**20,
        "end_backlog_mib": backlog / 2**20,
        "buffer_overflow": peak > buffer_mib * 2**20,
        "raw_storage_GB_per_hour": mean * 1e6 / 8 * 3600 / 1e9,
        "notes": "Payload-only deterministic model, not measured radio/SD performance. PTS gaps do not prove STRB alignment.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("probe_json", type=Path)
    parser.add_argument("--service-mbps", type=float, required=True)
    parser.add_argument("--buffer-mib", type=float, default=16)
    parser.add_argument("--outage", action="append", default=[], metavar="START:END")
    args = parser.parse_args()
    try:
        outages = [tuple(map(float, value.split(":"))) for value in args.outage]
        if any(len(pair) != 2 for pair in outages):
            raise ValueError("outage must be START:END")
        result = analyze(json.loads(args.probe_json.read_text()), args.service_mbps,
                         args.buffer_mib, outages)
    except (ValueError, KeyError, OSError) as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
