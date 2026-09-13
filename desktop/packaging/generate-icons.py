#!/usr/bin/env python3
"""Convert the existing RootLens logo to desktop icon containers without redrawing it."""

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct

from PySide6.QtCore import QByteArray, QBuffer, QIODevice, Qt, qVersion
from PySide6.QtGui import QImage


def generate(source, pc):
    if qVersion() != "6.11.2":
        raise RuntimeError("Use the pinned Qt 6.11.2 build environment for reproducible icons.")
    original = QImage(str(source))
    if original.isNull() or (original.width(), original.height()) != (1024, 1024):
        raise ValueError("The source must be the existing 1024 × 1024 RootLens PNG.")
    assets = pc / "rootlens_import/assets"
    icons = pc / "packaging/icons"
    assets.mkdir(parents=True, exist_ok=True)
    icons.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, assets / "rootlens.png")

    def png(size):
        if size == 1024:
            return source.read_bytes()
        image = original.scaled(size, size, Qt.KeepAspectRatio, Qt.SmoothTransformation)
        data = QByteArray()
        buffer = QBuffer(data)
        buffer.open(QIODevice.WriteOnly)
        if not image.save(buffer, "PNG"):
            raise RuntimeError("The icon PNG could not be encoded.")
        return bytes(data)

    sizes = (16, 24, 32, 48, 64, 128, 256)
    payloads = [png(size) for size in sizes]
    offset = 6 + 16 * len(sizes)
    entries = []
    for size, payload in zip(sizes, payloads):
        entries.append(struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0,
                                   1, 32, len(payload), offset))
        offset += len(payload)
    (icons / "rootlens.ico").write_bytes(
        struct.pack("<HHH", 0, 1, len(sizes)) + b"".join(entries + payloads))
    chunks = []
    for kind, size in ((b"icp4", 16), (b"icp5", 32), (b"icp6", 64), (b"ic07", 128),
                       (b"ic08", 256), (b"ic09", 512), (b"ic10", 1024)):
        payload = png(size)
        chunks.append(kind + struct.pack(">I", 8 + len(payload)) + payload)
    content = b"".join(chunks)
    (icons / "rootlens.icns").write_bytes(b"icns" + struct.pack(">I", 8 + len(content)) + content)
    files = ("rootlens_import/assets/rootlens.png", "packaging/icons/rootlens.ico",
             "packaging/icons/rootlens.icns")
    manifest = {
        "source": "mobile/assets/icon.png",
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "conversion": "Unchanged PNG; proportional Qt smooth resizing into PNG-backed ICO and ICNS containers.",
        "qt_version": qVersion(),
        "sha256": {name: hashlib.sha256((pc / name).read_bytes()).hexdigest() for name in files},
    }
    (icons / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main():
    pc = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=pc.parent / "mobile/assets/icon.png")
    args = parser.parse_args()
    generate(args.source.resolve(strict=True), pc)


if __name__ == "__main__":
    main()
