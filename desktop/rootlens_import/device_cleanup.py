"""Retire USB originals only against a freshly verified Drive manifest.

The pending directory name carries the full manifest digest. It is sufficient to
resume on another PC even after some payload files have already been removed.
"""

from collections.abc import Mapping
from dataclasses import dataclass
import hashlib
import json
import re
import shlex

from .core import CLIP_NAME, FILES, HASH, UNIT_ID, PACKAGES, ImportCancelled, ImportFailure, source_manifest_sha256


AUXILIARY_FILES = (
    "camera_frames.raw.jsonl", "sync_report.json",
    "camera_capture_failures.txt", "camera_index.bin", "video_index.bin",
    "accelerometer_index.bin", "gyroscope_index.bin",
)
KNOWN_FILES = frozenset((*FILES, *AUXILIARY_FILES))
PENDING_PREFIX = ".rootlens-cleanup-"
PENDING_NAME = re.compile(
    r"\.rootlens-cleanup-(rec-\d{8}T\d{6}\.\d{3}Z)-(unit_[A-Za-z0-9_-]+)-([0-9a-f]{64})\Z"
)
DRIVE_ID = re.compile(r"[A-Za-z0-9_-]{1,256}\Z")
STAT_FORMAT = "%s|%d|%i|%y|%z"
CHANGED = "録画の内容が確認中に変わりました。端末に残っているデータを保持し、削除を中止しました。"
INVALID = "端末の録画を安全に削除できません。端末に残っているデータを保持しています。管理者に確認してください。"
DRIVE_CHANGED = "Google Driveの保存内容を確認できないため、端末からの削除を中止しました。もう一度「接続」を押してください。"
CANCELLED = "端末からの削除を中止しました。次の接続で残りのデータを確認します。"


@dataclass(frozen=True)
class PendingClip:
    name: str
    original_name: str
    unit_id: str
    manifest_digest: str


@dataclass(frozen=True)
class CleanupResult:
    name: str
    unit_id: str


@dataclass(frozen=True)
class CleanupProgress:
    name: str
    unit_id: str
    state: str
    error: str = ""


def _check(adb):
    selector = getattr(adb, "selector", None)
    if (not isinstance(selector, list) or len(selector) != 2 or selector[0] != "-t"
            or not isinstance(selector[1], str) or not re.fullmatch(r"[1-9][0-9]*", selector[1])):
        raise ImportFailure("接続したスマートグラスを確認できません。もう一度「接続」を押してください。")
    event = getattr(adb, "cancel_event", None)
    if event is not None and event.is_set():
        raise ImportCancelled(CANCELLED)


def _validate_root(root):
    if root not in {f"/sdcard/Android/data/{package}/files/recordings" for package in PACKAGES}:
        raise ImportFailure(INVALID)


def _directory_guard(root, remote=None):
    # /sdcard itself is an Android-managed alias; its children must be directories.
    parts = root.split("/")
    paths = ["/".join(parts[:end]) for end in range(3, len(parts) + 1)]
    if remote is not None and remote != root:
        paths.append(remote)
    return " && ".join(f"[ -d {shlex.quote(path)} ] && [ ! -L {shlex.quote(path)} ]" for path in paths)


def _shell(adb, command, timeout=60):
    _check(adb)
    return adb.shell(command, timeout=timeout)


def _names(adb, root, remote):
    output = _shell(adb, _directory_guard(root, remote) + " && ls -1A -- " + shlex.quote(remote))
    names = output.splitlines() if output else []
    if len(names) != len(set(names)):
        raise ImportFailure(INVALID)
    return set(names)


def discover_pending(adb, root):
    """Find only strict pending names on the already pinned USB transport."""
    _validate_root(root)
    quoted = shlex.quote(root)
    absent = _shell(adb, f"if [ ! -e {quoted} ] && [ ! -L {quoted} ]; then echo absent; fi")
    if absent == "absent":
        return []
    result = []
    for name in sorted(_names(adb, root, root)):
        if not name.startswith(PENDING_PREFIX):
            continue
        match = PENDING_NAME.fullmatch(name)
        if match is None or not UNIT_ID.fullmatch(match.group(2)):
            raise ImportFailure(INVALID)
        # Reject links before a caller treats the entry as resumable work.
        _shell(adb, _directory_guard(root, root + "/" + name))
        result.append(PendingClip(name, *match.groups()))
    return result


def _snapshot(adb, root, remote):
    names = _names(adb, root, remote)
    if not names.issubset(KNOWN_FILES):
        raise ImportFailure(INVALID)
    ordered = sorted(names)
    commands = [_directory_guard(root, remote)]
    for name in ordered:
        path = shlex.quote(remote + "/" + name)
        commands.append(f"[ -f {path} ] && [ ! -L {path} ] && stat -c {shlex.quote(STAT_FORMAT)} -- {path}")
    lines = _shell(adb, " && ".join(commands)).splitlines() if ordered else []
    if len(lines) != len(ordered):
        raise ImportFailure(INVALID)
    result = {}
    for name, signature in zip(ordered, lines):
        parts = signature.split("|")
        if len(parts) != 5 or not parts[0].isdigit():
            raise ImportFailure(INVALID)
        size = int(parts[0])
        if name in FILES and size <= 0:
            raise ImportFailure(INVALID)
        result[name] = (size, signature)
    if _names(adb, root, remote) != names:
        raise ImportFailure(CHANGED)
    return result


def _manifest(drive_reader, unit_id, original_name):
    """Validate structural fields; the reader checks current destination membership."""
    descriptor = drive_reader(unit_id)
    if descriptor is None or getattr(descriptor, "unit_id", None) != unit_id:
        raise ImportFailure(DRIVE_CHANGED)
    folder_id = getattr(descriptor, "folder_id", None)
    files = getattr(descriptor, "files", None)
    if (not isinstance(folder_id, str) or not DRIVE_ID.fullmatch(folder_id)
            or getattr(descriptor, "name", None) != unit_id
            or not isinstance(getattr(descriptor, "source_manifest_sha256", None), str)
            or not isinstance(files, Mapping) or set(files) != set(FILES)):
        raise ImportFailure(DRIVE_CHANGED)
    normalized = {}
    ids = {folder_id}
    for name in FILES:
        item = files[name]
        if not isinstance(item, Mapping):
            raise ImportFailure(DRIVE_CHANGED)
        file_id, size, digest = item.get("id"), item.get("size"), item.get("sha256")
        if (not isinstance(file_id, str) or not DRIVE_ID.fullmatch(file_id) or file_id in ids
                or type(size) is not int or size <= 0
                or not isinstance(digest, str) or not HASH.fullmatch(digest)):
            raise ImportFailure(DRIVE_CHANGED)
        ids.add(file_id)
        normalized[name] = dict(id=file_id, size=size, sha256=digest)
    source_files = {name: {"size": item["size"], "sha256": item["sha256"]}
                    for name, item in normalized.items()}
    if source_manifest_sha256(unit_id, source_files) != descriptor.source_manifest_sha256:
        raise ImportFailure(DRIVE_CHANGED)
    encoded = json.dumps(dict(folder_id=folder_id, files=normalized), sort_keys=True,
                         separators=(",", ":"), ensure_ascii=True).encode("ascii")
    return normalized, hashlib.sha256(encoded).hexdigest()


def _verify_files(adb, root, remote, unit_id, files, *, complete):
    before = _snapshot(adb, root, remote)
    present = tuple(name for name in FILES if name in before)
    if complete and set(present) != set(FILES):
        raise ImportFailure(INVALID)
    if "metadata.json" in before:
        _check(adb)
        if adb.metadata(remote)["unit_id"] != unit_id:
            raise ImportFailure(INVALID)
    if any(before[name][0] != files[name]["size"] for name in present):
        raise ImportFailure(DRIVE_CHANGED)
    if present:
        _check(adb)
        checksums = adb.checksums(remote, present)
        if any(checksums.get(name) != files[name]["sha256"] for name in present):
            raise ImportFailure(DRIVE_CHANGED)
    if _snapshot(adb, root, remote) != before:
        raise ImportFailure(CHANGED)
    return before


def cleanup_recording(adb, root, name, expected_unit_id, drive_reader, log=print, on_progress=None):
    """Verify, persist a resumable name, then unlink only explicitly known files.

    The caller supplies a live Drive lookup, never a local completion journal or
    cached descriptor. Auxiliary capture diagnostics are not Drive payloads;
    they may be retired only after the four payload files have been verified.
    """
    _validate_root(root)
    if not isinstance(name, str) or not isinstance(expected_unit_id, str) or not UNIT_ID.fullmatch(expected_unit_id):
        raise ImportFailure(INVALID)
    pending = PENDING_NAME.fullmatch(name)
    if pending is not None:
        original_name, unit_id, expected_manifest = pending.groups()
        if unit_id != expected_unit_id:
            raise ImportFailure(INVALID)
    elif CLIP_NAME.fullmatch(name):
        original_name, unit_id, expected_manifest = name, expected_unit_id, None
    else:
        raise ImportFailure(INVALID)

    def report(state, error=""):
        if on_progress is not None:
            on_progress(CleanupProgress(original_name, unit_id, state, error))

    try:
        _check(adb)
        report("verifying")
        remote = root + "/" + name
        files, manifest_digest = _manifest(drive_reader, unit_id, original_name)
        if expected_manifest is not None and manifest_digest != expected_manifest:
            raise ImportFailure(DRIVE_CHANGED)
        before = _verify_files(adb, root, remote, unit_id, files, complete=pending is None)
        _check(adb)
        if _manifest(drive_reader, unit_id, original_name)[1] != manifest_digest:
            raise ImportFailure(DRIVE_CHANGED)
        if _snapshot(adb, root, remote) != before:
            raise ImportFailure(CHANGED)
        if pending is None:
            pending_name = f"{PENDING_PREFIX}{original_name}-{unit_id}-{manifest_digest}"
            if len(pending_name.encode("ascii")) > 255:
                raise ImportFailure(INVALID)
            target = root + "/" + pending_name
            source_q, target_q = shlex.quote(remote), shlex.quote(target)
            _shell(adb, _directory_guard(root, remote)
                   + f" && [ ! -e {target_q} ] && [ ! -L {target_q} ]"
                   + f" && mv -n -T -- {source_q} {target_q}"
                   + f" && [ ! -e {source_q} ] && [ ! -L {source_q} ]"
                   + f" && [ -d {target_q} ] && [ ! -L {target_q} ]")
            remote = target
        # Make the resumable name durable before the first payload unlink.
        _shell(adb, _directory_guard(root, remote) + " && sync", timeout=120)
        if _snapshot(adb, root, remote) != before:
            raise ImportFailure(CHANGED)
        _check(adb)
        if _manifest(drive_reader, unit_id, original_name)[1] != manifest_digest:
            raise ImportFailure(DRIVE_CHANGED)
        report("deleting")
        for filename in (*AUXILIARY_FILES, *FILES):
            if filename not in before:
                continue
            if _snapshot(adb, root, remote) != before:
                raise ImportFailure(CHANGED)
            quoted = shlex.quote(remote + "/" + filename)
            signature = shlex.quote(before[filename][1])
            # The same shell checks the file immediately before unlinking it.
            _shell(adb, _directory_guard(root, remote)
                   + f" && [ -f {quoted} ] && [ ! -L {quoted} ]"
                   + f" && [ \"$(stat -c {shlex.quote(STAT_FORMAT)} -- {quoted})\" = {signature} ]"
                   + f" && rm -- {quoted}")
            del before[filename]
        if _snapshot(adb, root, remote):
            raise ImportFailure(CHANGED)
        _shell(adb, _directory_guard(root, remote) + " && rmdir -- " + shlex.quote(remote))
        report("deleted")
        log("Driveへの保存を確認し、スマートグラスから録画を削除しました。")
        return CleanupResult(original_name, unit_id)
    except ImportCancelled:
        report("cancelled", CANCELLED)
        raise ImportCancelled(CANCELLED) from None
    except ImportFailure as error:
        report("error", str(error))
        raise
    except Exception:
        report("error", INVALID)
        raise ImportFailure(INVALID) from None
