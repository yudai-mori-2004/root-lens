#!/usr/bin/env python3
"""Small dependency-free sanity check for binary STL outputs."""

from __future__ import annotations

import math
import struct
import sys
from pathlib import Path


def sub(a: tuple[float, float, float], b: tuple[float, float, float]):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def cross(a: tuple[float, float, float], b: tuple[float, float, float]):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def dot(a: tuple[float, float, float], b: tuple[float, float, float]):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def inspect(path: Path):
    raw = path.read_bytes()
    if len(raw) < 84:
        raise ValueError("file is shorter than a binary STL header")
    triangle_count = struct.unpack_from("<I", raw, 80)[0]
    expected = 84 + triangle_count * 50
    if len(raw) != expected:
        raise ValueError(
            f"binary STL length mismatch: expected {expected}, got {len(raw)}"
        )

    lo = [math.inf, math.inf, math.inf]
    hi = [-math.inf, -math.inf, -math.inf]
    signed_volume = 0.0
    surface_area = 0.0

    offset = 84
    for _ in range(triangle_count):
        values = struct.unpack_from("<12fH", raw, offset)
        vertices = (
            (values[3], values[4], values[5]),
            (values[6], values[7], values[8]),
            (values[9], values[10], values[11]),
        )
        for vertex in vertices:
            for axis in range(3):
                lo[axis] = min(lo[axis], vertex[axis])
                hi[axis] = max(hi[axis], vertex[axis])

        ab = sub(vertices[1], vertices[0])
        ac = sub(vertices[2], vertices[0])
        normal = cross(ab, ac)
        surface_area += 0.5 * math.sqrt(dot(normal, normal))
        signed_volume += dot(vertices[0], cross(vertices[1], vertices[2])) / 6.0
        offset += 50

    size = tuple(hi[i] - lo[i] for i in range(3))
    volume_cm3 = abs(signed_volume) / 1000.0
    # Solid-volume upper estimates. A slicer may replace thick regions with
    # infill, while the 1.9-3 mm walls generally remain solid.
    petg_g = volume_cm3 * 1.27
    pa12_g = volume_cm3 * 1.01
    return triangle_count, size, volume_cm3, petg_g, pa12_g, surface_area


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: check_stl.py FILE.stl [...]", file=sys.stderr)
        return 2

    print(
        "file\ttriangles\tbbox_mm(XxYxZ)\tvolume_cm3\tPETG_solid_g\tPA12_g"
    )
    failed = False
    for name in sys.argv[1:]:
        path = Path(name)
        try:
            count, size, volume, petg, pa12, _ = inspect(path)
            dims = "x".join(f"{value:.1f}" for value in size)
            print(
                f"{path.name}\t{count}\t{dims}\t{volume:.2f}\t"
                f"{petg:.1f}\t{pa12:.1f}"
            )
        except Exception as exc:  # noqa: BLE001 - CLI reports every bad file.
            failed = True
            print(f"{path.name}\tERROR\t{exc}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

