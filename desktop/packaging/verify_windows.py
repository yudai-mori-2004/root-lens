"""Run artifact acceptance on a disposable Windows CI runner, without site keys."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import struct
import sys
import tempfile
import time


def sha256(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def verify_executable_icon(executable, output, label):
    """Read actual PE icon resources, match all source sizes, and export the largest PNG."""
    import pefile
    source = (Path(__file__).with_name("icons") / "rootlens.ico").read_bytes()
    expected = {}
    for index in range(struct.unpack_from("<H", source, 4)[0]):
        width, height, _, _, planes, bits, size, offset = struct.unpack_from("<BBBBHHII", source, 6 + index * 16)
        expected[(width or 256, height or 256)] = source[offset:offset + size]
    with pefile.PE(str(executable)) as pe:
        entries = {entry.id: entry.directory.entries for entry in pe.DIRECTORY_ENTRY_RESOURCE.entries}
        icons = {entry.id: entry.directory.entries[0].data.struct for entry in entries[pefile.RESOURCE_TYPE["RT_ICON"]]}
        group = entries[pefile.RESOURCE_TYPE["RT_GROUP_ICON"]][0].directory.entries[0].data.struct
        data = pe.get_data(group.OffsetToData, group.Size)
        actual = {}
        for index in range(struct.unpack_from("<H", data, 4)[0]):
            width, height, _, _, planes, bits, size, resource_id = struct.unpack_from("<BBBBHHIH", data, 6 + index * 14)
            resource = icons[resource_id]
            actual[(width or 256, height or 256)] = pe.get_data(resource.OffsetToData, resource.Size)
    if actual != expected:
        raise RuntimeError("The executable's icon resources differ from the RootLens icon.")
    image = output / (label + "-icon.png")
    image.write_bytes(actual[(256, 256)])
    return {"ok": True, "source_icon_sha256": hashlib.sha256(source).hexdigest(),
            "sizes": sorted(width for width, height in actual), "preview": image.name}


def run(command, *, environment=None, timeout=60, expected=0):
    result = subprocess.run([str(part) for part in command], env=environment, timeout=timeout,
                            capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != expected:
        raise RuntimeError(f"{Path(command[0]).name} returned {result.returncode}; expected {expected}.")
    return result


def diagnostic(executable, name, arguments, output, environment):
    path = output / (name + ".log")
    # WebEngine's child process can outlive the launcher and keep inherited pipes open.
    # Write console output to a file so waiting for pipe EOF cannot hang acceptance.
    with (output / (name + "-console.log")).open("wb") as console:
        result = subprocess.run(
            [str(executable), "--diagnostic-output", str(path), *map(str, arguments)],
            env=environment, timeout=75, stdout=console, stderr=subprocess.STDOUT,
        )
    if result.returncode:
        raise RuntimeError(f"{name} returned {result.returncode}.")
    if not path.is_file() or not path.stat().st_size:
        raise RuntimeError(f"No diagnostic evidence for {name}.")
    content = path.read_text(encoding="utf-8")
    if arguments[0].startswith("--check-"):
        result = json.loads(content.strip().splitlines()[-1])
        if result.get("ok") is not True:
            raise RuntimeError(f"{name} did not confirm success.")
        return result
    if "--output" not in content or "--clip" not in content:
        raise RuntimeError("Frozen CLI help is incomplete.")
    return {"ok": True, "cli_help": True}


def launch_gui(executable, environment, output, label):
    log = output / (label + ".log")
    child = subprocess.Popen([str(executable), "--diagnostic-output", str(log)], env=environment)
    try:
        time.sleep(3)
        if child.poll() is not None:
            raise RuntimeError(f"{label} exited during startup.")
    finally:
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=15)
    return {"ok": True, "alive_after_seconds": 3}


def main(arguments=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle-dir", type=Path, required=True)
    parser.add_argument("--installer", type=Path, required=True)
    parser.add_argument("--sample-video", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(arguments)
    if sys.platform != "win32" or os.environ.get("CI", "").lower() != "true":
        parser.error("Installer acceptance runs only on a disposable Windows CI runner (CI=true).")
    import winreg
    uninstall_key = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{DF82D3D9-DF73-4D27-A1DA-5E7ECB83FEE2}_is1"
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, uninstall_key):
            parser.error("RootLens is already installed for this user; use a clean CI runner.")
    except FileNotFoundError:
        pass
    bundle = args.bundle_dir.resolve(strict=True)
    installer = args.installer.resolve(strict=True)
    sample = args.sample_video.resolve(strict=True)
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    evidence = {"platform": "Windows x64", "installer": installer.name,
                "installer_bytes": installer.stat().st_size, "installer_sha256": sha256(installer), "checks": {}}
    environment = dict(os.environ)
    # GitHub's virtual display has no usable GPU video surfaces; exercise the
    # packaged FFmpeg decoder on its software path instead.
    environment["QT_FFMPEG_DECODING_HW_DEVICE_TYPES"] = ","
    environment["QT_DISABLE_HW_TEXTURES_CONVERSION"] = "1"
    # Prevent developer installations on PATH from hiding a missing bundled runtime.
    environment["PATH"] = os.pathsep.join([os.path.join(os.environ["SystemRoot"], "System32"),
                                           os.environ["SystemRoot"]])
    for name in ("PYTHONPATH", "PYTHONHOME", "ROOTLENS_ADB", "ANDROID_HOME", "ANDROID_SDK_ROOT"):
        environment.pop(name, None)
    installed = None
    with tempfile.TemporaryDirectory(prefix="RootLens Windows acceptance ") as temporary:
        sandbox = Path(temporary)
        environment["LOCALAPPDATA"] = str(sandbox / "AppData")
        retained = sandbox / "AppData" / "RootLens Import" / "data" / "test-preserved.txt"
        retained.parent.mkdir(parents=True)
        retained.write_text("Synthetic retention marker; not a recording.", encoding="utf-8")
        try:
            executable = bundle / "RootLens Import.exe"
            if not executable.is_file():
                raise RuntimeError("The Windows executable is missing.")
            evidence["checks"]["bundle-icon"] = verify_executable_icon(executable, output, "bundle")
            for path in bundle.rglob("*"):
                if path.is_file() and (path.name in ("site.json", "rootlens-site.json")
                                       or path.suffix.lower() in (".mp4", ".mov", ".mcap")):
                    raise RuntimeError("A site profile or recording was included in the bundle.")
            for label, flags in (("bundle-runtime", ["--check-runtime"]),
                                 ("bundle-media", ["--check-media", sample]),
                                 ("bundle-browser", ["--check-browser"]),
                                 ("bundle-cli", ["--cli", "--help"])):
                evidence["checks"][label] = diagnostic(executable, label, flags, output, environment)
            evidence["checks"]["bundle-gui"] = launch_gui(executable, environment, output, "bundle-gui")
            installed = sandbox / "Program Files" / "RootLens Import"
            run([installer, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-",
                 "/DIR=" + str(installed), "/LOG=" + str(output / "install.log")], timeout=180)
            installed_executable = installed / "RootLens Import.exe"
            if not installed_executable.is_file() or sha256(installed_executable) != sha256(executable):
                raise RuntimeError("Installed executable differs from the verified bundle.")
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, uninstall_key) as key:
                location, _ = winreg.QueryValueEx(key, "InstallLocation")
                if Path(location).resolve() != installed.resolve():
                    raise RuntimeError("The installer was not registered for the current user.")
            evidence["checks"]["per-user-install"] = {"ok": True, "admin_required": False}
            evidence["checks"]["installed-icon"] = verify_executable_icon(installed_executable, output, "installed")
            for label, flags in (("installed-runtime", ["--check-runtime"]),
                                 ("installed-media", ["--check-media", sample]),
                                 ("installed-browser", ["--check-browser"]),
                                 ("installed-cli", ["--cli", "--help"])):
                evidence["checks"][label] = diagnostic(installed_executable, label, flags, output, environment)
            evidence["checks"]["installed-gui"] = launch_gui(installed_executable, environment, output, "installed-gui")
        finally:
            if installed is not None and (installed / "unins000.exe").exists():
                run([installed / "unins000.exe", "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART",
                     "/LOG=" + str(output / "uninstall.log")], timeout=180)
                for _ in range(100):
                    if not (installed / "RootLens Import.exe").exists():
                        break
                    time.sleep(.1)
                if (installed / "RootLens Import.exe").exists() or not retained.is_file():
                    raise RuntimeError("Uninstall did not remove the app while preserving app data.")
                evidence["checks"]["uninstall-keeps-data"] = {"ok": True}
            (output / "windows-acceptance.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "evidence": str(output / "windows-acceptance.json")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
