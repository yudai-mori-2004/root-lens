"""Build a work list from one connected device and retire verified Drive copies."""

from dataclasses import dataclass, field
from pathlib import Path

from .core import (
    Adb, ClipProgress, ImportCancelled, ImportFailure, check_cancelled, find_adb,
    import_clip, import_lock, is_link, recover_staging,
)
from .device_cleanup import cleanup_recording, discover_pending


@dataclass(frozen=True)
class DeviceSource:
    adb: Adb
    serial: str
    root: str
    name: str
    content_hash: str
    lock_directory: Path


@dataclass(frozen=True)
class SyncSummary:
    output: Path
    imported: int = 0
    existing: int = 0
    incomplete: int = 0
    failed: int = 0
    cleaned: int = 0
    cleanup_pending: int = 0
    sources: dict[str, DeviceSource] = field(default_factory=dict)


def _output_directory(output):
    output = Path(output).expanduser().absolute()
    for path in (output, *output.parents):
        if is_link(path):
            raise ImportFailure("このPCの保存先を利用できません。管理者に保存場所を確認してもらってください。")
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    staging = output.parent / ("." + output.name + "-importing")
    staging.mkdir(mode=0o700, parents=True, exist_ok=True)
    return output, staging


def sync_recordings(output, *, drive_reader, log=print, cancel_event=None,
                    on_clip=None, on_drive_checked=None, adb_path=None, package=None):
    """Read USB first; Drive is queried only for hashes currently on that device."""
    check_cancelled(cancel_event)
    adb = Adb(find_adb(adb_path), cancel_event=cancel_event)
    serial = adb.connect()
    selected_package = adb.package(package)
    root = f"/sdcard/Android/data/{selected_package}/files/recordings"
    output, staging = _output_directory(output)
    counts = dict(imported=0, existing=0, incomplete=0, failed=0, cleaned=0, cleanup_pending=0)
    sources = {}

    def report(name, state, path=None, error=""):
        if on_clip is not None:
            on_clip(ClipProgress(name, path, state, error))

    def read_drive(hashes):
        check_cancelled(cancel_event)
        try:
            return drive_reader(hashes)
        except ImportCancelled:
            raise
        except Exception:
            raise ImportFailure("Google Driveの保存状況を確認できません。インターネット接続と事業所の設定を確認し、もう一度「接続」を押してください。") from None

    def fresh_recording(content_hash):
        return read_drive({content_hash}).get(content_hash)

    def clean(name, content_hash, display_name):
        report(display_name, "deleting")
        log("Driveに保存済みの録画を確認し、スマートグラスから削除しています…")
        try:
            if adb.run("get-serialno") != serial:
                raise ImportFailure("接続したスマートグラスが変わりました。もう一度「接続」を押してください。")
            cleanup_recording(adb, root, name, content_hash, fresh_recording, log=log)
        except ImportCancelled:
            raise
        except (ImportFailure, OSError) as error:
            counts["cleanup_pending"] += 1
            report(display_name, "cleanup_pending", error=str(error))
            log("端末からの削除が終わっていません。次の接続でもう一度確認します。")
        else:
            counts["cleaned"] += 1
            report(display_name, "drive_saved")

    with import_lock(staging):
        recover_staging(staging)
        names = adb.clip_names(root)
        pending = discover_pending(adb, root)
        complete = {}
        for name in names:
            check_cancelled(cancel_event)
            report(name, "discovering")
            try:
                remote = root + "/" + name
                if not adb.complete(remote):
                    counts["incomplete"] += 1
                    report(name, "incomplete")
                    continue
                metadata = adb.metadata(remote)
                complete[name] = metadata["content_hash"]
            except ImportCancelled:
                raise
            except (ImportFailure, OSError) as error:
                counts["failed"] += 1
                report(name, "error", error=str(error))
        for item in pending:
            report(item.original_name, "deleting")
        hashes = set(complete.values()) | {item.content_hash for item in pending}
        log("スマートグラスの録画がDriveに保存されているか確認しています…")
        snapshots = read_drive(hashes) if hashes else {}
        if on_drive_checked is not None:
            on_drive_checked(snapshots)
        for item in pending:
            clean(item.name, item.content_hash, item.original_name)
        for name, content_hash in complete.items():
            check_cancelled(cancel_event)
            if content_hash in snapshots:
                clean(name, content_hash, name)
                continue
            try:
                result = import_clip(adb, root, name, output, staging, log=log, on_clip=on_clip)
                if result in ("imported", "existing"):
                    if adb.metadata(root + "/" + name)["content_hash"] != content_hash:
                        raise ImportFailure("接続中に録画情報が変わりました。もう一度「接続」を押してください。")
                    sources[name] = DeviceSource(adb, serial, root, name, content_hash, staging)
                counts[result] += 1
            except ImportCancelled:
                raise
            except (ImportFailure, OSError) as error:
                counts["failed"] += 1
                report(name, "error", error=str(error))
                log(str(error))
    return SyncSummary(output, **counts, sources=sources)


def cleanup_uploaded_recording(source, *, drive_reader, log=print, cancel_event=None):
    """Keep the original USB transport; never reconnect to a replacement device."""
    if not isinstance(source, DeviceSource):
        raise ImportFailure("スマートグラスの接続を確認できません。もう一度「接続」を押してください。")
    check_cancelled(cancel_event)
    source.adb.cancel_event = cancel_event
    with import_lock(source.lock_directory):
        if source.adb.run("get-serialno") != source.serial:
            raise ImportFailure("接続したスマートグラスが変わりました。もう一度「接続」を押してください。")
        return cleanup_recording(source.adb, source.root, source.name, source.content_hash,
                                 lambda digest: drive_reader({digest}).get(digest), log=log)
