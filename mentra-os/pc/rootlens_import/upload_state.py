"""Private resumable-upload journal; never stored inside recording originals."""

import hashlib
import json
from pathlib import Path
import re

from .core import FILES, ImportFailure, is_link
from .library import settings_path
from .site import drive_folder_id, write_private_json

SCHEMA = "rootlens.drive-upload.v1"
HASH = re.compile(r"[0-9a-f]{64}\Z")
DRIVE_ID = re.compile(r"[A-Za-z0-9_-]{1,200}\Z")


def state_directory(profile, base=None):
    parent_id = drive_folder_id(profile)
    account = (profile.service_account or {}).get("client_email", "")
    destination = hashlib.sha256((parent_id + "\n" + account).encode()).hexdigest()[:24]
    root = settings_path().parent / "uploads" if base is None else Path(base)
    directory = root / profile.site_id / destination
    if any(is_link(part) for part in (directory, *directory.parents)):
        raise ImportFailure("アップロードの履歴を保存できません。管理者にこのPCの保存先を確認してもらってください。")
    return directory


def validate_state(value, profile, content_hash=None):
    if (not isinstance(value, dict) or value.get("schema") != SCHEMA
            or value.get("site_id") != profile.site_id
            or value.get("parent_id") != drive_folder_id(profile)
            or value.get("account") != (profile.service_account or {}).get("client_email", "")
            or not isinstance(value.get("content_hash"), str)
            or not HASH.fullmatch(value["content_hash"])
            or content_hash is not None and value["content_hash"] != content_hash
            or type(value.get("completed")) is not bool
            or not isinstance(value.get("files"), dict)
            or set(value["files"]) != set(FILES)):
        raise ImportFailure("アップロードの履歴を読み込めません。管理者に確認してください。")
    folder_id = value.get("folder_id")
    if folder_id is not None and (not isinstance(folder_id, str) or not DRIVE_ID.fullmatch(folder_id)):
        raise ImportFailure("以前のアップロード先を確認できません。管理者に確認してください。")
    for info in value["files"].values():
        if (not isinstance(info, dict) or type(info.get("size")) is not int or info["size"] <= 0
                or not isinstance(info.get("sha256"), str) or not HASH.fullmatch(info["sha256"])
                or type(info.get("verified")) is not bool):
            raise ImportFailure("以前アップロードしたファイルの情報を読み込めません。管理者に確認してください。")
        if info.get("id") is not None and (not isinstance(info["id"], str) or not DRIVE_ID.fullmatch(info["id"])):
            raise ImportFailure("以前アップロードしたファイルを確認できません。管理者に確認してください。")
        if info.get("session") is not None and not isinstance(info["session"], str):
            raise ImportFailure("アップロードを再開するための情報を読み込めません。管理者に確認してください。")
    if value["completed"] and (not folder_id or any(not item["verified"] or not item.get("id")
                                                   for item in value["files"].values())):
        raise ImportFailure("以前のアップロードが完了したか確認できません。管理者に確認してください。")
    return value


def read_state(path, profile, content_hash=None):
    if is_link(path) or not path.is_file() or path.stat().st_size > 64 * 1024:
        raise ImportFailure("アップロードの履歴を開けません。管理者に確認してください。")
    try:
        return validate_state(json.loads(path.read_text(encoding="utf-8")), profile, content_hash)
    except (ValueError, UnicodeError):
        raise ImportFailure("アップロードの履歴を読み込めません。管理者に確認してください。") from None


def completed_hashes(profile, state_dir=None):
    """Local receipts attest to verification at upload time, not eternal custody."""
    directory = state_directory(profile, state_dir)
    if not directory.exists():
        return set()
    result = set()
    for path in directory.glob("*.json"):
        if not HASH.fullmatch(path.stem):
            continue
        try:
            value = read_state(path, profile, path.stem)
        except (ImportFailure, OSError):
            continue
        if value["completed"]:
            result.add(value["content_hash"])
    return result


class UploadJournal:
    def __init__(self, profile, content_hash, manifest, base=None):
        if not HASH.fullmatch(content_hash):
            raise ImportFailure("録画情報を読み込めません。管理者に確認してください。")
        self.profile = profile
        self.path = state_directory(profile, base) / (content_hash + ".json")
        if self.path.exists() or is_link(self.path):
            self.value = read_state(self.path, profile, content_hash)
            for name, local in manifest.items():
                saved = self.value["files"][name]
                if any(saved[key] != local[key] for key in ("size", "sha256")):
                    raise ImportFailure("録画の内容が前回のアップロード時から変わっています。管理者に確認してください。")
            if not self.value["completed"]:
                return
        # Finished attempts must rediscover current Drive objects. Only an unfinished
        # attempt retains allocated IDs and resumable sessions across retries.
        self.value = {"schema": SCHEMA, "site_id": profile.site_id,
                      "parent_id": drive_folder_id(profile),
                      "account": profile.service_account["client_email"],
                      "content_hash": content_hash, "folder_id": None, "completed": False,
                      "files": {name: {**item, "id": None, "session": None, "verified": False}
                                for name, item in manifest.items()}}
        self.save()

    def save(self):
        validate_state(self.value, self.profile)
        write_private_json(self.path, self.value)
