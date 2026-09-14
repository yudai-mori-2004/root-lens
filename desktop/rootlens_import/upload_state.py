"""Private journal for resumable uploads issued by the RootLens API."""

import json
from pathlib import Path

from .core import FILES, HASH, UNIT_ID, ImportFailure, is_link, unit_files_sha256
from .library import settings_path
from .site import has_unsafe_link, write_private_json

SCHEMA = "rootlens.drive-upload.v4"


def state_directory(profile, base=None):
    root = settings_path().parent / "uploads" if base is None else Path(base)
    directory = root / profile.site_id
    if has_unsafe_link(directory):
        raise ImportFailure("アップロードの履歴を保存できません。管理者にこのPCの保存先を確認してもらってください。")
    return directory


def validate_state(value, profile, unit_id=None):
    if (not isinstance(value, dict) or value.get("schema") != SCHEMA
            or value.get("site_id") != profile.site_id
            or not isinstance(value.get("unit_id"), str) or not UNIT_ID.fullmatch(value["unit_id"])
            or unit_id is not None and value["unit_id"] != unit_id
            or type(value.get("completed")) is not bool
            or not isinstance(value.get("files_sha256"), str)
            or not HASH.fullmatch(value["files_sha256"])
            or not isinstance(value.get("files"), dict) or set(value["files"]) != set(FILES)):
        raise ImportFailure("アップロードの履歴を読み込めません。管理者に確認してください。")
    for field in ("attempt_id", "folder_id"):
        if value.get(field) is not None and (not isinstance(value[field], str) or not value[field]):
            raise ImportFailure("アップロードの履歴を読み込めません。管理者に確認してください。")
    for info in value["files"].values():
        if (not isinstance(info, dict) or type(info.get("size")) is not int or info["size"] <= 0
                or not isinstance(info.get("sha256"), str) or not HASH.fullmatch(info["sha256"])
                or type(info.get("uploaded")) is not bool
                or info.get("session") is not None and not isinstance(info["session"], str)):
            raise ImportFailure("アップロードの履歴を読み込めません。管理者に確認してください。")
    manifest = {name: {"size": info["size"], "sha256": info["sha256"]}
                for name, info in value["files"].items()}
    if unit_files_sha256(value["unit_id"], manifest) != value["files_sha256"]:
        raise ImportFailure("以前アップロードしたファイル一覧を確認できません。管理者に確認してください。")
    return value


def read_state(path, profile, unit_id=None):
    if is_link(path) or not path.is_file() or path.stat().st_size > 64 * 1024:
        raise ImportFailure("アップロードの履歴を開けません。管理者に確認してください。")
    try:
        return validate_state(json.loads(path.read_text(encoding="utf-8")), profile, unit_id)
    except (ValueError, UnicodeError):
        raise ImportFailure("アップロードの履歴を読み込めません。管理者に確認してください。") from None


def completed_unit_ids(profile, state_dir=None):
    directory = state_directory(profile, state_dir)
    if not directory.exists():
        return set()
    result = set()
    for path in directory.glob("*.json"):
        if not UNIT_ID.fullmatch(path.stem):
            continue
        try:
            value = read_state(path, profile, path.stem)
        except (ImportFailure, OSError):
            continue
        if value["completed"]:
            result.add(value["unit_id"])
    return result


class UploadJournal:
    def __init__(self, profile, unit_id, manifest, base=None):
        self.profile = profile
        self.path = state_directory(profile, base) / (unit_id + ".json")
        if self.path.exists() or is_link(self.path):
            self.value = read_state(self.path, profile, unit_id)
            if any(self.value["files"][name][key] != manifest[name][key]
                   for name in FILES for key in ("size", "sha256")):
                raise ImportFailure("録画の内容が前回のアップロード時から変わっています。管理者に確認してください。")
            return
        self.value = {
            "schema": SCHEMA,
            "site_id": profile.site_id,
            "unit_id": unit_id,
            "files_sha256": unit_files_sha256(unit_id, manifest),
            "attempt_id": None,
            "folder_id": None,
            "completed": False,
            "files": {name: {**item, "session": None, "uploaded": False}
                      for name, item in manifest.items()},
        }
        self.save()

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        write_private_json(self.path, validate_state(self.value, self.profile))
