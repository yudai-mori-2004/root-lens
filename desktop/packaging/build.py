#!/usr/bin/env python3
"""Build a desktop bundle using a locally installed Platform-Tools runtime."""

import argparse
import hashlib
from importlib import metadata
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import tempfile

PLATFORM_TOOLS_VERSION = "37.0.0"
NETWORK_PACKAGES = (
    "requests", "certifi", "charset-normalizer", "idna", "urllib3",
)


def build_requirements(path):
    """Return pinned requirements that apply to the current build platform."""
    result = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        requirement, separator, marker = line.partition(";")
        if separator:
            marker = marker.strip()
            if marker == 'sys_platform == "win32"' and sys.platform != "win32":
                continue
            if marker != 'sys_platform == "win32"':
                raise RuntimeError(f"Unsupported requirement marker: {marker}")
        name, expected = requirement.strip().split("==", 1)
        result.append((name, expected))
    return result


def verify_icon_assets(pc):
    manifest = json.loads((pc / "packaging/icons/manifest.json").read_text(encoding="utf-8"))
    expected = {"rootlens_import/assets/rootlens.png", "packaging/icons/rootlens.ico",
                "packaging/icons/rootlens.icns"}
    if set(manifest["sha256"]) != expected:
        raise RuntimeError("The icon manifest does not describe the required desktop icons.")
    for name, digest in manifest["sha256"].items():
        if hashlib.sha256((pc / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError(f"Icon asset differs from its manifest: {name}")
    if manifest["sha256"]["rootlens_import/assets/rootlens.png"] != manifest["source_sha256"]:
        raise RuntimeError("The bundled logo must be identical to the source PNG.")
    source = pc.parent / "mobile/assets/icon.png"
    if source.exists() and hashlib.sha256(source.read_bytes()).hexdigest() != manifest["source_sha256"]:
        raise RuntimeError("Regenerate desktop icons from the current RootLens logo.")
    return manifest


def copy_network_notices(destination):
    """Include the license files shipped in every authentication/HTTP wheel."""
    for name in NETWORK_PACKAGES:
        distribution = metadata.distribution(name)
        files = [entry for entry in distribution.files or ()
                 if any(marker in entry.name.lower() for marker in ("license", "copying", "notice"))]
        if not files:
            raise RuntimeError(f"Missing license notices for {name}.")
        directory = destination / f"{name}-{distribution.version}"
        directory.mkdir(parents=True)
        for entry in files:
            shutil.copy2(distribution.locate_file(entry), directory / entry.name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform-tools", type=Path, required=True,
                        help="Existing Platform-Tools directory whose licenses you have reviewed")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--runtime-notices", type=Path, required=True,
                        help="Notices for the selected Python/Qt runtime and its bundled libraries")
    args = parser.parse_args()
    packaging = Path(__file__).resolve().parent
    icon_manifest = verify_icon_assets(packaging.parent)
    if sys.platform not in ("darwin", "win32"):
        parser.error("Build on macOS for Mac, or Windows for Windows.")
    required_python = (3, 13) if sys.platform == "win32" else (3, 12)
    if sys.version_info[:2] != required_python:
        parser.error(f"Build with Python {required_python[0]}.{required_python[1]} for this target platform.")
    if sys.platform == "win32" and (platform.machine().lower() not in ("amd64", "x86_64")
                                    or sys.maxsize <= 2 ** 32):
        parser.error("The Windows installer requires a Windows x64 Python runtime.")
    import PySide6
    from PySide6.QtCore import qVersion
    import PyInstaller
    if PySide6.__version__ != "6.11.2":
        parser.error("Install the exact PySide6 version in requirements-build.txt.")
    if PyInstaller.__version__ != "6.22.0":
        parser.error("Install the exact versions in requirements-build.txt.")
    for name, expected in build_requirements(packaging / "requirements-build.txt"):
        if metadata.version(name) != expected:
            parser.error(f"Install {name}=={expected} from requirements-build.txt.")
    runtime = args.platform_tools.expanduser().resolve(strict=True)
    properties = dict(line.strip().split("=", 1) for line in
                      (runtime / "source.properties").read_text(encoding="utf-8").splitlines()
                      if "=" in line)
    if properties.get("Pkg.Revision") != PLATFORM_TOOLS_VERSION:
        parser.error(f"Platform-Tools {PLATFORM_TOOLS_VERSION} is required.")
    names = ["adb.exe", "AdbWinApi.dll", "AdbWinUsbApi.dll"] if sys.platform == "win32" else ["adb"]
    for name in (*names, "NOTICE.txt"):
        if not (runtime / name).is_file():
            parser.error(f"Required runtime file is missing: {name}")
    output = args.output.expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    notices = args.runtime_notices.expanduser().resolve(strict=True)
    if not notices.is_dir() or not any(path.is_file() for path in notices.rglob("*")):
        parser.error("Provide the runtime's third-party license notices directory.")
    for notice in notices.rglob("*"):
        if notice.is_symlink():
            parser.error("Runtime notices must contain regular files, not links.")
        if notice.is_file():
            if notice.suffix.lower() in (".mp4", ".mov", ".mcap") or notice.name in ("site.json", "rootlens-site.json"):
                parser.error("Runtime notices must not contain recordings or site configuration.")
            if re.search(rb'-----BEGIN (?:RSA )?PRIVATE KEY-----|"private_key"\s*:', notice.read_bytes()):
                parser.error("Runtime notices must not contain authentication keys.")
    with tempfile.TemporaryDirectory(prefix="rootlens-desktop-build-") as temporary:
        temporary = Path(temporary)
        staged_notices = temporary / "notices"
        shutil.copytree(notices, staged_notices)
        copy_network_notices(staged_notices / "Python-network-libraries")
        staged_runtime = temporary / "runtime"
        staged_runtime.mkdir()
        for name in (*names, "NOTICE.txt"):
            shutil.copy2(runtime / name, staged_runtime / name)
        manifest = {
            "platform_tools_version": PLATFORM_TOOLS_VERSION,
            "python_version": platform.python_version(),
            "pyside6_version": PySide6.__version__,
            "qt_version": qVersion(),
            "pyinstaller_version": PyInstaller.__version__,
            "network_library_versions": {name: metadata.version(name) for name in NETWORK_PACKAGES},
            "platform": sys.platform,
            "architecture": platform.machine(),
            "app_icon_sha256": icon_manifest["source_sha256"],
            "runtime_sha256": {name: hashlib.sha256((runtime / name).read_bytes()).hexdigest()
                               for name in names},
        }
        (staged_runtime / "runtime-manifest.json").write_text(
            json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
        )
        environment = dict(os.environ, ROOTLENS_PACKAGING_RUNTIME=str(staged_runtime),
                           ROOTLENS_RUNTIME_NOTICES=str(staged_notices))
        if sys.platform == "darwin" and environment.get("ROOTLENS_CODESIGN_IDENTITY"):
            environment["PYINSTALLER_STRICT_BUNDLE_CODESIGN_ERROR"] = "1"
        if sys.platform == "win32":
            sys.path.insert(0, str(packaging.parent))
            from rootlens_import import __version__
            version = tuple(int(part) for part in __version__.split(".")) + (0,)
            version_file = temporary / "windows-version.txt"
            version_file.write_text(
                "VSVersionInfo(ffi=FixedFileInfo(filevers=" + repr(version) + ", prodvers=" + repr(version)
                + ", mask=0x3f, flags=0, OS=0x40004, fileType=1, subtype=0, date=(0, 0)), "
                + "kids=[StringFileInfo([StringTable('040904B0', ["
                + "StringStruct('CompanyName', 'RootLens'), StringStruct('ProductName', 'RootLens Importer'), "
                + "StringStruct('FileDescription', 'RootLens Importer'), StringStruct('FileVersion', '" + __version__ + "'), "
                + "StringStruct('ProductVersion', '" + __version__ + "')])]), VarFileInfo([VarStruct('Translation', [1033, 1200])])])",
                encoding="utf-8")
            environment["ROOTLENS_WINDOWS_VERSION_INFO"] = str(version_file)
        subprocess.run(
            [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
             "--distpath", str(output), "--workpath", str(temporary / "work"),
             str(packaging / "RootLensImport.spec")],
            env=environment, check=True,
        )
    print(f"Built in {output}. Distribution signing and first-PC USB verification are separate release checks.")


if __name__ == "__main__":
    main()
