"""Disposable, single-instance workspace for USB previews and upload retries."""

import os
from pathlib import Path
import re
import shutil
import tempfile

from .core import ImportFailure, import_lock, is_link


RUN_NAME = re.compile(r"run-[a-z0-9_]{8,}\Z")


class WorkWorkspace:
    def __init__(self, base=None):
        self.root = Path(base) if base is not None else Path(tempfile.gettempdir()).resolve() / "RootLens-Import-Cache"
        if is_link(self.root):
            raise ImportFailure("一時作業領域を安全に使用できません。保存先を確認してください。")
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        if os.name != "nt" and self.root.stat().st_uid != os.getuid():
            raise ImportFailure("一時作業領域を安全に使用できません。保存先を確認してください。")
        self._lock = import_lock(self.root)
        self._lock.__enter__()
        self._closed = False
        self.path = None
        try:
            self._discard_old_runs()
            self.reset()
        except Exception:
            self._lock.__exit__(None, None, None)
            raise

    def _discard_old_runs(self):
        for path in self.root.iterdir():
            if not RUN_NAME.fullmatch(path.name):
                continue
            if is_link(path) or not path.is_dir():
                raise ImportFailure("一時作業領域を安全に削除できません。保存先を確認してください。")
            shutil.rmtree(path)

    def reset(self):
        if self._closed:
            raise ImportFailure("一時作業領域を使用できません。アプリを再起動してください。")
        if self.path is not None:
            shutil.rmtree(self.path)
        self.path = Path(tempfile.mkdtemp(prefix="run-", dir=self.root))
        return self.path

    def close(self):
        if self._closed:
            return
        self._closed = True
        try:
            if self.path is not None:
                shutil.rmtree(self.path)
                self.path = None
        finally:
            self._lock.__exit__(None, None, None)
