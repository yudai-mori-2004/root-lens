"""Build a work list from one connected device and retire verified Drive copies."""

from dataclasses import dataclass, field
from pathlib import Path

from .core import (
    Adb, ClipProgress, ImportCancelled, ImportFailure, check_cancelled, find_adb,
    ensure_unit_id, import_clip, import_lock, is_link, recover_staging, UNIT_ID, FILES,
    checksum, validate_local_files,
)
from .device_cleanup import cleanup_recording, discover_pending


@dataclass(frozen=True)
class DeviceSource:
    adb: Adb
    serial: str
    root: str
    name: str
    unit_id: str
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
    local_cleaned: int = 0
    local_cleanup_pending: int = 0
    sources: dict[str, DeviceSource] = field(default_factory=dict)


def remove_saved_local_copy(output, unit_id, recording):
    """Remove an app-owned preview copy only when it matches the saved unit."""
    directory = output / unit_id
    if not directory.exists():
        return False
    if (not UNIT_ID.fullmatch(unit_id) or is_link(directory) or not directory.is_dir()
            or recording is None or recording.unit_id != unit_id
            or set(recording.files) != set(FILES)):
        raise ImportFailure("PCの録画を安全に削除できません。保存先を確認してください。")
    local_files = list(directory.iterdir())
    if {path.name for path in local_files} - set(FILES) - {".DS_Store", "Thumbs.db", "desktop.ini"}:
        raise ImportFailure("PCの録画を安全に削除できません。保存先を確認してください。")
    for path in local_files:
        if path.name not in FILES:
            continue
        name = path.name
        saved = recording.files[name]
        if (is_link(path) or not path.is_file() or path.stat().st_size != saved["size"]
                or checksum(path) != saved["sha256"]):
            raise ImportFailure("PCの録画とDriveの保存内容が一致しないため、PCの録画を残しました。")
    _delete_local_directory(directory)
    return True


def _delete_local_directory(directory):
    for path in directory.iterdir():
        if is_link(path) or not path.is_file():
            raise ImportFailure("PCの録画を安全に削除できません。保存先を確認してください。")
        path.unlink()
    directory.rmdir()


def remove_uploaded_local_copy(output, unit_id):
    """Discard the preview copy after the server has verified this upload."""
    if not UNIT_ID.fullmatch(unit_id):
        raise ImportFailure("PCの録画を安全に削除できません。保存先を確認してください。")
    directory = output / unit_id
    if not directory.exists():
        return False
    validate_local_files(directory)
    _delete_local_directory(directory)
    return True


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
                    on_clip=None, on_drive_checked=None, adb_path=None, package=None,
                    site_id="local"):
    """Import device recordings even offline; reconcile only known unit ids."""
    check_cancelled(cancel_event)
    adb = Adb(find_adb(adb_path), cancel_event=cancel_event)
    serial = adb.connect()
    selected_package = adb.package(package)
    root = f"/sdcard/Android/data/{selected_package}/files/recordings"
    output, staging = _output_directory(output)
    counts = dict(imported=0, existing=0, incomplete=0, failed=0, cleaned=0,
                  cleanup_pending=0, local_cleaned=0, local_cleanup_pending=0)
    sources = {}

    def report(name, state, path=None, error=""):
        if on_clip is not None:
            on_clip(ClipProgress(name, path, state, error))

    def read_drive(unit_ids):
        check_cancelled(cancel_event)
        try:
            return drive_reader(unit_ids)
        except ImportCancelled:
            raise
        except Exception:
            raise ImportFailure("Google Driveの保存状況を確認できません。インターネット接続と事業所の設定を確認し、もう一度「接続」を押してください。") from None

    def fresh_recording(unit_id):
        return read_drive({unit_id}).get(unit_id)

    def clean(name, unit_id, display_name):
        report(display_name, "deleting")
        log("Driveに保存済みの録画を確認し、スマートグラスから削除しています…")
        try:
            if adb.run("get-serialno") != serial:
                raise ImportFailure("接続したスマートグラスが変わりました。もう一度「接続」を押してください。")
            cleanup_recording(adb, root, name, unit_id, fresh_recording, log=log)
        except ImportCancelled:
            raise
        except (ImportFailure, OSError) as error:
            counts["cleanup_pending"] += 1
            report(display_name, "cleanup_pending", error=str(error))
            log("端末からの削除が終わっていません。次の接続でもう一度確認します。")
        else:
            counts["cleaned"] += 1
            try:
                if remove_saved_local_copy(output, unit_id, fresh_recording(unit_id)):
                    counts["local_cleaned"] += 1
            except (ImportFailure, OSError) as error:
                counts["local_cleanup_pending"] += 1
                log(str(error))
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
                metadata = ensure_unit_id(adb, remote, site_id)
                complete[name] = metadata["unit_id"]
            except ImportCancelled:
                raise
            except (ImportFailure, OSError) as error:
                counts["failed"] += 1
                report(name, "error", error=str(error))
        for item in pending:
            report(item.original_name, "deleting")
        unit_ids = set(complete.values()) | {item.unit_id for item in pending}
        log("スマートグラスの録画がDriveに保存されているか確認しています…")
        drive_error = ""
        try:
            snapshots = read_drive(unit_ids) if unit_ids else {}
        except ImportFailure as error:
            drive_error = str(error)
            snapshots = {}
        if on_drive_checked is not None:
            on_drive_checked(snapshots, drive_error)
        for item in pending:
            if drive_error:
                counts["cleanup_pending"] += 1
                report(item.original_name, "cleanup_pending", error=drive_error)
            else:
                clean(item.name, item.unit_id, item.original_name)
        for name, unit_id in complete.items():
            check_cancelled(cancel_event)
            if unit_id in snapshots:
                clean(name, unit_id, name)
                continue
            try:
                result = import_clip(adb, root, name, output, staging, site_id=site_id, log=log, on_clip=on_clip)
                if result in ("imported", "existing"):
                    if adb.metadata(root + "/" + name)["unit_id"] != unit_id:
                        raise ImportFailure("接続中に録画情報が変わりました。もう一度「接続」を押してください。")
                    sources[unit_id] = DeviceSource(adb, serial, root, name, unit_id, staging)
                counts[result] += 1
            except ImportCancelled:
                raise
            except (ImportFailure, OSError) as error:
                counts["failed"] += 1
                report(name, "error", error=str(error))
                log(str(error))
        if not drive_error:
            local_ids = {path.name for path in output.iterdir()
                         if path.is_dir() and not is_link(path) and UNIT_ID.fullmatch(path.name)}
            local_only = sorted(local_ids - set(complete.values()))
            for start in range(0, len(local_only), 100):
                try:
                    saved = read_drive(set(local_only[start:start + 100]))
                except ImportFailure as error:
                    log(str(error))
                    break
                for unit_id, recording in saved.items():
                    try:
                        if remove_saved_local_copy(output, unit_id, recording):
                            counts["local_cleaned"] += 1
                    except (ImportFailure, OSError) as error:
                        counts["local_cleanup_pending"] += 1
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
        return cleanup_recording(source.adb, source.root, source.name, source.unit_id,
                                 lambda unit_id: drive_reader({unit_id}).get(unit_id), log=log)
