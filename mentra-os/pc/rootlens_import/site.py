"""Validate and persist a site name and its approved-data destination."""

from dataclasses import asdict, dataclass, field, replace
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit
from uuid import uuid4

from .core import ImportFailure, is_link

SITE_SCHEMA = "rootlens.site.v1"


@dataclass(frozen=True)
class SiteProfile:
    site_id: str
    site_name: str
    approved_drive_url: str
    status: str = "active"
    service_account: dict | None = field(default=None, repr=False)


def validate_service_account(value):
    """Accept only a Google service-account key, never arbitrary auth config."""
    if not isinstance(value, dict) or value.get("type") != "service_account":
        raise ImportFailure("アップロードの設定を読み込めません。管理者から受け取った事業所の設定ファイルを選んでください。")
    required = ("project_id", "private_key_id", "private_key", "client_email", "token_uri")
    if any(not isinstance(value.get(name), str) or not value[name] for name in required):
        raise ImportFailure("アップロードに必要な設定がありません。管理者に設定ファイルを確認してもらってください。")
    if (value["token_uri"] != "https://oauth2.googleapis.com/token"
            or value.get("universe_domain", "googleapis.com") != "googleapis.com"
            or not re.fullmatch(r"[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.gserviceaccount\.com", value["client_email"])
            or not value["private_key"].startswith("-----BEGIN PRIVATE KEY-----\n")
            or not value["private_key"].rstrip().endswith("-----END PRIVATE KEY-----")):
        raise ImportFailure("アップロードの設定に誤りがあります。管理者に事業所の設定ファイルを確認してもらってください。")
    return value


def drive_folder_id(profile):
    validate_site_profile(profile)
    if profile.status != "active":
        raise ImportFailure("この事業所の設定は利用できません。管理者に確認してください。")
    return urlsplit(profile.approved_drive_url).path.rstrip("/").split("/")[-1]


def _text(value, label, limit=200):
    if (not isinstance(value, str) or not value.strip() or len(value) > limit
            or any(ord(c) < 32 for c in value)):
        raise ImportFailure(f"設定ファイルの{label}に誤りがあります。管理者に確認してください。")
    return value.strip()


def validate_site_profile(profile):
    if not isinstance(profile, SiteProfile):
        raise ImportFailure("事業所の設定を読み込めません。管理者から受け取った設定ファイルを選んでください。")
    if not isinstance(profile.site_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", profile.site_id):
        raise ImportFailure("事業所の設定に誤りがあります。管理者から新しい設定ファイルを受け取ってください。")
    _text(profile.site_name, "事業所名")
    if profile.status not in ("active", "template"):
        raise ImportFailure("この事業所の設定は利用できません。管理者に確認してください。")
    if profile.service_account is not None:
        validate_service_account(profile.service_account)
    if profile.status == "template" and not profile.approved_drive_url:
        return profile
    try:
        url = urlsplit(profile.approved_drive_url)
        valid = (url.scheme == "https" and url.netloc == "drive.google.com"
                 and re.fullmatch(r"/drive/(?:u/\d+/)?folders/[A-Za-z0-9_-]{10,}/?", url.path)
                 and not url.fragment and len(profile.approved_drive_url) <= 2048)
    except (TypeError, ValueError):
        valid = False
    if not valid:
        raise ImportFailure("Google Driveの保存先を確認できません。管理者に事業所の設定ファイルを確認してもらってください。")
    return profile


def _read_json(path, max_bytes=1024 * 1024):
    path = Path(path)
    if is_link(path) or not path.is_file() or path.stat().st_size > max_bytes:
        raise ImportFailure(f"{path.name} を読み込めません。管理者から受け取った設定ファイルを選んでください。")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError):
        raise ImportFailure(f"{path.name} を読み込めません。設定ファイルをもう一度ダウンロードしてください。") from None
    if not isinstance(value, dict):
        raise ImportFailure(f"{path.name} を設定ファイルとして読み込めません。管理者に確認してください。")
    return value


def load_site_profile(path):
    value = _read_json(path, 64 * 1024)
    if value.pop("schema", None) != SITE_SCHEMA:
        raise ImportFailure("この設定ファイルには対応していません。管理者から新しい設定ファイルを受け取ってください。")
    try:
        return validate_site_profile(SiteProfile(**value))
    except TypeError as error:
        raise ImportFailure("事業所の設定に不足や誤りがあります。管理者に設定ファイルを確認してもらってください。") from error


def attach_service_account(profile, path):
    value = validate_service_account(_read_json(path, 64 * 1024))
    return validate_site_profile(replace(profile, service_account=value))


def _write_json(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as out:
        json.dump(value, out, ensure_ascii=False, indent=2)
        out.write("\n")
        out.flush()
        os.fsync(out.fileno())


def write_private_json(path, value):
    """Replace a small app-private JSON atomically, without a public temp file."""
    path = Path(path)
    def unsafe_link(part):
        if not is_link(part):
            return False
        # macOS exposes its temporary directories through these system aliases.
        return not (sys.platform == "darwin" and part in (Path("/var"), Path("/tmp"))
                    and part.resolve() == Path("/private") / part.name)
    if any(unsafe_link(part) for part in (path, *path.parents)):
        raise ImportFailure("このPCに設定や履歴を保存できません。管理者に保存先を確認してもらってください。")
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name("." + path.name + "-" + uuid4().hex)
    try:
        _write_json(temporary, value)
        os.replace(temporary, path)
        if os.name != "nt":
            descriptor = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(descriptor)
            finally:
                os.close(descriptor)
    finally:
        temporary.unlink(missing_ok=True)


def save_site_profile(profile, path):
    validate_site_profile(profile)
    write_private_json(path, {"schema": SITE_SCHEMA, **asdict(profile)})
