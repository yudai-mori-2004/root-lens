#!/usr/bin/env python3
"""Fetch pinned Windows ADB and collect the selected runtime's license notices."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
from importlib import metadata
import json
from pathlib import Path
import platform
import re
import shutil
import ssl
import sys
import time
import urllib.request
import zipfile

ADB_URL = "https://dl.google.com/android/repository/platform-tools_r37.0.0-win.zip"
ADB_SHA256 = "4fe305812db074cea32903a489d061eb4454cbc90a49e8fea677f4b7af764918"


def fetch(url, destination, expected=None):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=45) as response:
                data = response.read()
            if expected and hashlib.sha256(data).hexdigest() != expected:
                raise RuntimeError(f"Source changed; review before updating its hash: {url}")
            destination.write_bytes(data)
            return
        except (OSError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def openssl_notice(version, destination):
    match = re.match(r"OpenSSL (\d+\.\d+\.\d+[a-z]?)\b", version)
    if not match:
        raise RuntimeError(f"Unsupported OpenSSL version: {version}")
    tag = "openssl-" + match[1]
    url = f"https://raw.githubusercontent.com/openssl/openssl/{tag}/LICENSE.txt"
    folder = destination / ("OpenSSL-" + match[1])
    fetch(url, folder / "LICENSE.txt")
    (folder / "SOURCE.txt").write_text(url + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if sys.platform != "win32" or platform.machine().lower() not in ("amd64", "x86_64"):
        parser.error("Run with Windows x64 Python.")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    archive = output / "platform-tools.zip"
    fetch(ADB_URL, archive, ADB_SHA256)
    with zipfile.ZipFile(archive) as bundle:
        for info in bundle.infolist():
            target = (output / info.filename).resolve()
            if not target.is_relative_to(output):
                raise RuntimeError("Invalid Platform-Tools archive path")
        bundle.extractall(output)
    notices = output / "runtime-notices"
    notices.mkdir(exist_ok=True)
    packaging = Path(__file__).resolve().parent
    manifest = json.loads((packaging / "qt-notice-sources.json").read_text(encoding="utf-8"))
    qt = notices / ("Qt-" + manifest["qt_version"])
    qt.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(lambda item: fetch(item["url"], qt / item["file"], item["sha256"]), manifest["files"]))
    shutil.copyfile(packaging / "qt-notices-readme.txt", qt / "README.txt")
    shutil.copyfile(packaging / "qt-notice-sources.json", qt / "notice-manifest.json")
    for name in ("pyinstaller", "PySide6", "PySide6-Essentials", "PySide6-Addons", "shiboken6"):
        distribution = metadata.distribution(name)
        entries = [entry for entry in distribution.files or ()
                   if any(word in entry.name.lower() for word in ("license", "copying", "notice"))]
        for entry in entries:
            path = notices / (name + "-" + distribution.version) / str(entry)
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(distribution.locate_file(entry), path)
    license_file = Path(sys.base_prefix) / "LICENSE.txt"
    if not license_file.is_file():
        raise RuntimeError("Windows Python's bundled LICENSE.txt is missing")
    shutil.copyfile(license_file, notices / "PYTHON-LICENSE.txt")
    from cryptography.hazmat.backends.openssl.backend import backend
    for version in {ssl.OPENSSL_VERSION, backend.openssl_version_text()}:
        openssl_notice(version, notices)
    (output / "inputs.json").write_text(json.dumps({
        "platform_tools_url": ADB_URL, "platform_tools_sha256": ADB_SHA256,
        "python": platform.python_version(), "python_openssl": ssl.OPENSSL_VERSION,
        "cryptography_openssl": backend.openssl_version_text(),
        "qt": manifest["qt_version"], "qt_notice_files": len(manifest["files"]),
    }, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared Windows build inputs in {output}")


if __name__ == "__main__":
    main()
