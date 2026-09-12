#!/usr/bin/env python3
"""Copy complete Mentra recordings over USB into ordinary PC folders."""

import argparse
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import socket
import stat
import struct
import subprocess
import sys
import tempfile
import time
from typing import Literal, Optional


FILES = ("rgb.mp4", "frames.jsonl", "imu.jsonl", "metadata.json")
DESKTOP_FILES = {".DS_Store", "Thumbs.db", "desktop.ini"}
PACKAGES = ("io.rootlens.mentra.debug", "io.rootlens.mentra")
CLIP_NAME = re.compile(r"rec-\d{8}T\d{6}\.\d{3}Z\Z")
HASH = re.compile(r"[0-9a-f]{64}\Z")
DEFAULT_OUTPUT = Path.home() / "Downloads" / "RootLens" / "Mentra"


class ImportFailure(Exception):
    pass


class ImportCancelled(ImportFailure):
    pass


@dataclass(frozen=True)
class ImportSummary:
    output: Path
    imported: int
    existing: int
    incomplete: int
    failed: int


@dataclass(frozen=True)
class ClipProgress:
    name: str
    path: Optional[Path]
    state: Literal["discovering", "importing", "verifying", "ready", "drive_saved", "cleanup_pending", "deleting", "incomplete", "error"]
    error: str = ""


def check_cancelled(cancel_event):
    if cancel_event is not None and cancel_event.is_set():
        raise ImportCancelled("処理を中止しました。")


def is_link(path):
    """Include Windows junctions, which pathlib does not classify as symlinks."""
    if path.is_symlink():
        return True
    try:
        return getattr(path.lstat(), "st_reparse_tag", None) == getattr(
            stat, "IO_REPARSE_TAG_MOUNT_POINT", 0xA0000003)
    except FileNotFoundError:
        return False


def find_adb(explicit=None):
    if explicit and not (Path(explicit).is_file() and os.access(explicit, os.X_OK)):
        raise ImportFailure("USB接続に必要なプログラムを起動できません。管理者にアプリを入れ直してもらってください。")
    executable_name = "adb.exe" if os.name == "nt" else "adb"
    bundled = Path(__file__).with_name("runtime") / executable_name
    candidates = [explicit, str(bundled), os.environ.get("ROOTLENS_ADB"), shutil.which("adb")]
    for key in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        if os.environ.get(key):
            candidates.append(str(Path(os.environ[key]) / "platform-tools" / executable_name))
    candidates += [
        str(Path.home() / "Library/Android/sdk/platform-tools/adb"),
        str(Path.home() / "Android/Sdk/platform-tools/adb"),
        str(Path(os.environ.get("LOCALAPPDATA", "")) / "Android/Sdk/platform-tools/adb.exe"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return str(Path(candidate).resolve())
    raise ImportFailure("USB接続に必要なプログラムが見つかりません。管理者にアプリを入れ直してもらってください。")


class Adb:
    def __init__(self, executable, cancel_event=None):
        self.executable = executable
        self.cancel_event = cancel_event
        self.selector = ["-d"]
        self.environment = dict(os.environ)
        # Use the local server and a physical USB device, even with wireless ADB configured.
        for key in ("ANDROID_SERIAL", "ADB_SERVER_SOCKET", "ANDROID_ADB_SERVER_ADDRESS",
                    "ANDROID_ADB_SERVER_PORT"):
            self.environment.pop(key, None)
        if sys.platform == "darwin":
            self.environment.setdefault("ADB_LIBUSB", "1")

    def run(self, *args, timeout=60):
        check_cancelled(self.cancel_event)
        child = None
        try:
            child = subprocess.Popen(
                [self.executable, "-H", "127.0.0.1", "-P", "5037", *self.selector, *args],
                env=self.environment, stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            deadline = time.monotonic() + timeout
            while True:
                check_cancelled(self.cancel_event)
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise ImportFailure("スマートグラスとの通信に時間がかかっています。USBケーブルをつなぎ直し、もう一度「接続」を押してください。")
                try:
                    stdout, stderr = child.communicate(timeout=min(0.2, remaining))
                    break
                except subprocess.TimeoutExpired:
                    continue
        except OSError as error:
            raise ImportFailure("スマートグラスと通信できません。USBケーブルをつなぎ直し、もう一度「接続」を押してください。") from error
        finally:
            if child is not None and child.poll() is None:
                child.terminate()
                try:
                    child.communicate(timeout=2)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.communicate()
        if child.returncode:
            detail = stderr.decode("utf-8", errors="replace").strip()
            raise ImportFailure("スマートグラスと通信できません。USBケーブルをつなぎ直し、もう一度「接続」を押してください。")
        try:
            return stdout.decode("utf-8", errors="strict").strip()
        except UnicodeDecodeError as error:
            raise ImportFailure("スマートグラスから録画情報を読み込めません。USBケーブルをつなぎ直し、もう一度「接続」を押してください。") from error

    def usb_transport_id(self):
        # ADB's host:tport:usb selects USB and returns its ID atomically. Windows'
        # native backend omits usb: in devices -l, so that display is not a selector.
        def receive(channel, length):
            data = bytearray()
            while len(data) < length:
                check_cancelled(self.cancel_event)
                chunk = channel.recv(length - len(data))
                if not chunk:
                    raise ImportFailure("スマートグラスとの通信が途切れました。USBケーブルをつなぎ直し、もう一度「接続」を押してください。")
                data.extend(chunk)
            return bytes(data)

        try:
            with socket.create_connection(("127.0.0.1", 5037), timeout=5) as channel:
                request = b"host:tport:usb"
                channel.sendall(f"{len(request):04x}".encode("ascii") + request)
                status = receive(channel, 4)
                if status == b"FAIL":
                    length = int(receive(channel, 4), 16)
                    detail = receive(channel, length).decode("utf-8", errors="replace")
                    raise ImportFailure("スマートグラスを確認できません。端末を1台だけつなぎ、もう一度「接続」を押してください。")
                if status != b"OKAY":
                    raise ImportFailure("スマートグラスとの接続を確認できません。USBケーブルをつなぎ直し、もう一度「接続」を押してください。")
                transport = struct.unpack("<Q", receive(channel, 8))[0]
                if transport == 0:
                    raise ImportFailure("スマートグラスとの接続を確認できません。USBケーブルをつなぎ直し、もう一度「接続」を押してください。")
                return transport
        except (OSError, ValueError) as error:
            raise ImportFailure("スマートグラスとの接続を確認できません。USBケーブルをつなぎ直し、もう一度「接続」を押してください。") from error

    def connect(self):
        try:
            self.run("start-server")
            self.selector = ["-t", str(self.usb_transport_id())]
            serial = self.run("get-serialno")
        except ImportCancelled:
            raise
        except ImportFailure as error:
            raise ImportFailure(
                "スマートグラスの電源を入れ、データ通信に対応したUSB-Cケーブルで1台だけつないでください。\n"
                "つなぎ直したら、もう一度「接続」を押してください。"
            ) from error
        if not serial or serial == "unknown":
            raise ImportFailure("スマートグラスを確認できません。USBケーブルをつなぎ直し、もう一度「接続」を押してください。")
        return serial

    def shell(self, command, timeout=60):
        return self.run("shell", command, timeout=timeout)

    def package(self, requested=None):
        available = []
        installed = set(self.shell("pm list packages io.rootlens.mentra").splitlines())
        for name in (requested,) if requested else PACKAGES:
            if "package:" + name in installed:
                available.append(name)
        if len(available) != 1:
            raise ImportFailure(
                "スマートグラスの撮影アプリを確認できません。管理者に端末の設定を確認してもらってください。"
            )
        return available[0]

    def clip_names(self, root):
        listing = self.shell(
            f"if [ -d {shlex.quote(root)} ]; then ls -1 {shlex.quote(root)}; "
            "else echo ROOTLENS_NO_RECORDINGS; fi"
        )
        return sorted(name for name in listing.splitlines() if CLIP_NAME.fullmatch(name))

    def complete(self, remote):
        quoted = shlex.quote(remote)
        listing = self.shell(f"if [ -d {quoted} ] && [ ! -L {quoted} ]; then ls -1 {quoted}; fi")
        names = set(listing.splitlines())
        if not set(FILES).issubset(names) or "failure.json" in names:
            return False
        if any(name.endswith(".partial") for name in names):
            return False
        checks = []
        for name in FILES:
            path = shlex.quote(remote + "/" + name)
            checks.append(f"[ -f {path} ] && [ -s {path} ] && [ ! -L {path} ]")
        return self.shell("if " + " && ".join(checks) + "; then echo complete; fi") == "complete"

    def metadata(self, remote):
        try:
            return validate_metadata(json.loads(self.shell("cat " + shlex.quote(remote + "/metadata.json"))))
        except (ValueError, TypeError) as error:
            raise ImportFailure("端末の録画情報を読み込めません。録画の保存が終わってから、もう一度「接続」を押してください。") from error

    def sizes(self, remote):
        command = " && ".join("stat -c %s " + shlex.quote(remote + "/" + name) for name in FILES)
        try:
            values = [int(value) for value in self.shell(command).splitlines()]
        except ValueError as error:
            raise ImportFailure("端末の録画データを確認できません。USBケーブルをつなぎ直し、もう一度「接続」を押してください。") from error
        if len(values) != len(FILES) or min(values) <= 0:
            raise ImportFailure("端末の録画データを読み込めません。録画の保存が終わってから、もう一度「接続」を押してください。")
        return dict(zip(FILES, values))

    def checksums(self, remote, files=FILES):
        names = tuple(files)
        if not names or len(set(names)) != len(names) or not set(names).issubset(FILES):
            raise ValueError("Checksum files must be a nonempty subset of the recording files")
        paths = " ".join(shlex.quote(remote + "/" + name) for name in names)
        result = {}
        for line in self.shell("sha256sum " + paths, timeout=3600).splitlines():
            parts = line.split(None, 1)
            if len(parts) != 2 or not HASH.fullmatch(parts[0]):
                raise ImportFailure("端末の録画データを確認できません。USBケーブルをつなぎ直し、もう一度「接続」を押してください。")
            name = parts[1].strip().removeprefix(remote + "/")
            if name not in names or name in result:
                raise ImportFailure("端末の録画データを確認できません。USBケーブルをつなぎ直し、もう一度「接続」を押してください。")
            result[name] = parts[0]
        if set(result) != set(names):
            raise ImportFailure("端末の録画データを確認できません。USBケーブルをつなぎ直し、もう一度「接続」を押してください。")
        return result

    def pull(self, remote, local):
        self.run("pull", remote, str(local), timeout=6 * 3600)


def validate_metadata(metadata):
    if not isinstance(metadata, dict) or metadata.get("schema") != "rootlens.mentra.raw.v1":
        raise ImportFailure("この録画には対応していません。管理者にアプリのバージョンを確認してもらってください。")
    content_hash = metadata.get("content_hash")
    if not isinstance(content_hash, str) or not HASH.fullmatch(content_hash):
        raise ImportFailure("録画情報を読み込めません。管理者に確認してください。")
    names = metadata.get("files")
    if not isinstance(names, list) or sorted(names) != sorted(FILES):
        raise ImportFailure("録画情報に記載されたファイルが揃っていません。管理者に確認してください。")
    return metadata


def checksum(path, cancel_event=None):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            check_cancelled(cancel_event)
            digest.update(chunk)
    return digest.hexdigest()


def validate_local_files(directory):
    if is_link(directory) or not directory.is_dir():
        raise ImportFailure("この録画フォルダを開けません。管理者に保存場所を確認してもらってください。")
    paths = list(directory.iterdir())
    if {path.name for path in paths} - DESKTOP_FILES != set(FILES):
        raise ImportFailure("録画に必要なファイルが揃っていないか、別のファイルが含まれています。管理者に確認してください。")
    if any(is_link(path) or not path.is_file() for path in paths):
        raise ImportFailure("録画フォルダに読み込めないファイルが含まれています。管理者に確認してください。")


def verify_local(directory, expected, metadata, cancel_event=None):
    validate_local_files(directory)
    for name in FILES:
        path = directory / name
        if is_link(path) or not path.is_file() or checksum(path, cancel_event) != expected[name]:
            raise ImportFailure(f"録画データが元のファイルと一致しません（{name}）。管理者に確認してください。")
    try:
        local_metadata = validate_metadata(json.loads((directory / "metadata.json").read_text(encoding="utf-8")))
    except (ValueError, TypeError) as error:
        raise ImportFailure("PCにコピーした録画情報を読み込めません。管理者に確認してください。") from error
    if local_metadata != metadata or expected["rgb.mp4"] != metadata["content_hash"]:
        raise ImportFailure("映像と録画情報が一致しません。管理者に確認してください。")


@contextmanager
def import_lock(staging_root):
    if is_link(staging_root) or not staging_root.is_dir():
        raise ImportFailure("このPCに録画を取り込めません。管理者に保存場所を確認してもらってください。")
    if is_link(staging_root / "import.lock"):
        raise ImportFailure("このPCに録画を取り込めません。管理者に保存場所を確認してもらってください。")
    with (staging_root / "import.lock").open("a+b") as lock:
        try:
            if os.name == "nt":
                import msvcrt
                lock.seek(0, os.SEEK_END)
                if lock.tell() == 0:
                    lock.write(b"0")
                    lock.flush()
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise ImportFailure("このPCでは、別のウィンドウで取り込みかアップロードを実行しています。終了してから、もう一度お試しください。") from error
        try:
            yield
        finally:
            if os.name == "nt":
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def import_clip(adb, remote_root, name, output, staging_root, log=print, on_clip=None):
    check_cancelled(adb.cancel_event)
    def report(state, path=None):
        if on_clip is not None:
            on_clip(ClipProgress(name, path, state))

    report("discovering")
    remote = remote_root + "/" + name
    if not adb.complete(remote):
        log("端末で録画の保存が完了していないため、この録画は取り込みませんでした。")
        report("incomplete")
        return "incomplete"
    metadata = adb.metadata(remote)
    destination = output / (name + "-" + metadata["content_hash"][:12])
    if destination.exists() or is_link(destination):
        log("取り込み済みの録画を確認しています…")
        report("verifying", destination)
        verify_local(destination, adb.checksums(remote), metadata, adb.cancel_event)
        report("ready", destination)
        return "existing"
    total = sum(adb.sizes(remote).values())
    if shutil.disk_usage(output).free < total + 256 * 1024 * 1024:
        raise ImportFailure(f"PCの空き容量が足りません。管理者に空き容量を増やしてもらってから、もう一度「接続」を押してください。必要な空き容量：{total / 1024**3:.2f} GB + 256 MB")
    log(f"録画を取り込んでいます…（{total / 1024**3:.2f} GB）")
    report("importing", destination)
    with tempfile.TemporaryDirectory(prefix=name + "-", dir=staging_root) as temporary:
        stage = Path(temporary)
        for index, filename in enumerate(FILES, 1):
            check_cancelled(adb.cancel_event)
            log(f"録画データをコピーしています…（{index}/4）")
            adb.pull(remote + "/" + filename, stage / filename)
        log("端末の録画と、PCにコピーしたデータが一致するか確認しています…")
        report("verifying", destination)
        verify_local(stage, adb.checksums(remote), metadata, adb.cancel_event)
        if not adb.complete(remote):
            raise ImportFailure("取り込み中に端末の録画データが変わりました。録画の保存が終わってから、もう一度「接続」を押してください。")
        for filename in FILES:
            with (stage / filename).open("r+b") as payload:
                os.fsync(payload.fileno())
        if destination.exists() or is_link(destination):
            raise ImportFailure("取り込み中に同じ名前の録画フォルダが作成されました。管理者に確認してください。")
        check_cancelled(adb.cancel_event)
        stage.rename(destination)
    log("録画をPCに保存しました。")
    report("ready", destination)
    return "imported"


def recover_staging(staging_root):
    """Reclaim only importer-owned temporary folders while holding its lock."""
    pattern = re.compile(r"rec-\d{8}T\d{6}\.\d{3}Z-[a-z0-9_]{8}\Z")
    for path in staging_root.iterdir():
        if pattern.fullmatch(path.name) and path.is_dir() and not is_link(path):
            shutil.rmtree(path)


def open_folder(directory):
    if sys.platform == "darwin":
        subprocess.run(["open", str(directory)], check=True)
    elif os.name == "nt":
        os.startfile(directory)
    else:
        subprocess.run(["xdg-open", str(directory)], check=True)


def import_recordings(output=DEFAULT_OUTPUT, adb_path=None, package=None, clip=None,
                      log=print, cancel_event=None, on_clip=None):
    check_cancelled(cancel_event)
    adb = Adb(find_adb(adb_path), cancel_event=cancel_event)
    adb.connect()
    selected_package = adb.package(package)
    root = f"/sdcard/Android/data/{selected_package}/files/recordings"
    if clip and not CLIP_NAME.fullmatch(clip):
        raise ImportFailure("録画フォルダの名前を確認できません。管理者に確認してください。")
    output = Path(output).expanduser().absolute()
    for path in (output, *output.parents):
        if is_link(path):
            raise ImportFailure("このPCの保存先を利用できません。管理者に保存場所を確認してもらってください。")
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    staging_root = output.parent / ("." + output.name + "-importing")
    staging_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    results = {"imported": 0, "existing": 0, "incomplete": 0, "failed": 0}
    with import_lock(staging_root):
        recover_staging(staging_root)
        names = adb.clip_names(root)
        if clip:
            if clip not in names:
                raise ImportFailure(f"指定した録画が端末に見つかりません（{clip}）。端末を確認してください。")
            names = [clip]
        if on_clip is not None:
            for name in names:
                on_clip(ClipProgress(name, None, "discovering"))
        for name in names:
            check_cancelled(cancel_event)
            try:
                result = import_clip(adb, root, name, output, staging_root, log=log, on_clip=on_clip)
                results[result] += 1
            except ImportCancelled:
                raise
            except (ImportFailure, OSError) as error:
                results["failed"] += 1
                if on_clip is not None:
                    on_clip(ClipProgress(name, None, "error", str(error)))
                log(f"録画を取り込めませんでした。\n{error}")
    return ImportSummary(output=output, **results)


def main(argv=None):
    if sys.version_info < (3, 9):
        print("Python 3.9 以降が必要です。", file=sys.stderr)
        return 1
    parser = argparse.ArgumentParser(description="スマートグラスの録画をUSBでPCに取り込みます。")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="保存先フォルダ")
    parser.add_argument("--adb", help="ADB の実行ファイル")
    parser.add_argument("--package", choices=PACKAGES, help="撮影アプリのパッケージ")
    parser.add_argument("--clip", help="取り込むクリップ名を1つに限定（例: rec-20260910T185832.079Z）")
    parser.add_argument("--open", action="store_true", help="完了後に保存先を開く")
    args = parser.parse_args(argv)
    try:
        result = import_recordings(
            output=args.output, adb_path=args.adb, package=args.package, clip=args.clip,
            log=lambda message: print(message, flush=True),
        )
        print(f"\n新規 {result.imported}件 / 取り込み済み {result.existing}件 / "
              f"未確定 {result.incomplete}件 / エラー {result.failed}件")
        print(f"保存先: {result.output}\n端末の録画は保持しています。")
        print("録画フォルダを Google Drive のアップロード先へドラッグ＆ドロップしてください。")
        if args.open:
            open_folder(result.output)
        return 1 if result.failed else 0
    except (ImportFailure, OSError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\n処理を中止しました。", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
