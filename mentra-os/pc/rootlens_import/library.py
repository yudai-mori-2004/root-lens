"""Read preview copies; device and Drive observations determine the visible recordings."""

from dataclasses import dataclass
from datetime import datetime
import json
import os
from pathlib import Path
import re
import sys

from .core import FILES, ImportFailure, is_link, validate_local_files, validate_metadata


LOCAL_CLIP = re.compile(r"rec-\d{8}T\d{6}\.\d{3}Z-[0-9a-f]{12}\Z")


@dataclass(frozen=True)
class Recording:
    path: Path
    content_hash: str
    created_text: str
    duration_text: str


def settings_path():
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "RootLens Import"
    elif os.name == "nt":
        base = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local"))) / "RootLens Import"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME", str(Path.home() / ".config"))) / "rootlens-import"
    return base / "site.json"


def recordings_directory(site_id, base=None):
    """Use the existing app-local site directory without creating export copies."""
    if not isinstance(site_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", site_id):
        raise ImportFailure("事業所の設定に誤りがあります。管理者に設定ファイルを確認してもらってください。")
    root = settings_path().parent / "data" if base is None else Path(base)
    directory = root / site_id / "recordings"
    if any(is_link(path) for path in (directory, *directory.parents)):
        raise ImportFailure("このPCの保存先を利用できません。管理者に保存場所を確認してもらってください。")
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def read_recording(directory):
    """Read display metadata without hashing a whole video on the UI thread.

    USB import verifies every file before publishing this folder. This function
    reads a copy for preview; its presence never asserts device or Drive state.
    """
    directory = Path(directory)
    if is_link(directory) or not directory.is_dir() or not LOCAL_CLIP.fullmatch(directory.name):
        raise ImportFailure("この録画を開けません。もう一度「接続」を押して確認してください。")
    validate_local_files(directory)
    for name in FILES:
        path = directory / name
        if is_link(path) or not path.is_file() or path.stat().st_size <= 0:
            raise ImportFailure("録画に必要なファイルを読み込めません。もう一度「接続」を押して確認してください。")
    metadata_path = directory / "metadata.json"
    if metadata_path.stat().st_size > 1024 * 1024:
        raise ImportFailure("録画情報を読み込めません。管理者に確認してください。")
    metadata = validate_metadata(json.loads(metadata_path.read_text(encoding="utf-8")))
    content_hash = metadata["content_hash"]
    if not directory.name.endswith("-" + content_hash[:12]):
        raise ImportFailure("録画情報とフォルダ名が一致しません。管理者に確認してください。")
    try:
        timestamp = datetime.fromisoformat(metadata.get("created_at", "").replace("Z", "+00:00"))
        created = timestamp.astimezone().strftime("%Y/%m/%d %H:%M:%S")
    except (ValueError, TypeError, AttributeError, OverflowError):
        created = "日時情報なし"
    milliseconds = metadata.get("actual_duration_ms", 0)
    duration = int(milliseconds) // 1000 if isinstance(milliseconds, (int, float)) and 0 <= milliseconds <= 604800000 else 0
    return Recording(directory, content_hash, created, f"{duration // 3600}:{duration // 60 % 60:02d}:{duration % 60:02d}")


def scan_recordings(root):
    """List finalized recordings in shooting order, including disconnected clips."""
    if root is None:
        return []
    root = Path(root)
    if is_link(root) or not root.is_dir():
        return []
    rows = []
    for directory in sorted(root.iterdir()):
        try:
            rows.append(read_recording(directory))
        except (ImportFailure, OSError, ValueError, TypeError):
            continue
    return rows
