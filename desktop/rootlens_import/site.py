"""Persist the site selected from an authenticated RootLens account."""

from dataclasses import asdict, dataclass
import json
import os
from pathlib import Path
import re
import sys
from uuid import uuid4

from .core import ImportFailure, is_link

SITE_SCHEMA = "rootlens.desktop-site.v1"


@dataclass(frozen=True)
class SiteProfile:
    site_id: str
    site_name: str
    api_base_url: str = "https://www.rootlens.io"


def validate_site_profile(profile):
    if not isinstance(profile, SiteProfile):
        raise ImportFailure("事業所の情報を読み込めません。もう一度ログインしてください。")
    if not re.fullmatch(r"site_[a-z0-9][a-z0-9_-]{1,63}", profile.site_id):
        raise ImportFailure("事業所の情報を読み込めません。もう一度ログインしてください。")
    if not isinstance(profile.site_name, str) or not profile.site_name.strip() or len(profile.site_name) > 200:
        raise ImportFailure("事業所の情報を読み込めません。もう一度ログインしてください。")
    production = re.fullmatch(r"https://(?:www\.)?rootlens\.io", profile.api_base_url)
    development = re.fullmatch(r"http://(?:127\.0\.0\.1|localhost):\d+", profile.api_base_url)
    if not (production or development):
        raise ImportFailure("RootLensへの接続先を確認できません。アプリを更新してください。")
    return profile


def _write_json(path, value):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as out:
        json.dump(value, out, ensure_ascii=False, indent=2)
        out.write("\n")
        out.flush()
        os.fsync(out.fileno())


def has_unsafe_link(path):
    path = Path(path)
    def unsafe_link(part):
        if not is_link(part):
            return False
        return not (sys.platform == "darwin" and part in (Path("/var"), Path("/tmp"))
                    and part.resolve() == Path("/private") / part.name)
    return any(unsafe_link(part) for part in (path, *path.parents))


def write_private_json(path, value):
    path = Path(path)
    if has_unsafe_link(path):
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
    write_private_json(path, {"schema": SITE_SCHEMA, **asdict(validate_site_profile(profile))})


def load_site_profile(path):
    path = Path(path)
    if is_link(path) or not path.is_file() or path.stat().st_size > 16 * 1024:
        raise ImportFailure("保存した事業所の情報を読み込めません。もう一度ログインしてください。")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict) or value.pop("schema", None) != SITE_SCHEMA:
            raise ValueError()
        return validate_site_profile(SiteProfile(**value))
    except (ValueError, UnicodeError, TypeError):
        raise ImportFailure("保存した事業所の情報を読み込めません。もう一度ログインしてください。") from None
