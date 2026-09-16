"""A PC restart must leave no authoritative recording cache or login token."""

from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from rootlens_import.account import SessionStore
from rootlens_import import workspace
from rootlens_import.workspace import WorkWorkspace


class WorkspaceTests(unittest.TestCase):
    def test_close_and_next_launch_discard_work_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "cache"
            stale = root / "run-stale0000"
            stale.mkdir(parents=True)
            (stale / "rgb.mp4").write_bytes(b"old preview")
            first = WorkWorkspace(root)
            self.assertFalse(stale.exists())
            first_run = first.path
            (first_run / "rgb.mp4").write_bytes(b"new preview")
            first.close()
            self.assertFalse(first_run.exists())
            second = WorkWorkspace(root)
            self.assertNotEqual(first_run, second.path)
            second.close()

    def test_login_token_does_not_survive_a_new_store(self):
        first = SessionStore()
        first.save("s" * 43)
        self.assertIsNone(SessionStore().load())
        first.clear()

    def test_default_cache_resolves_a_symlinked_system_temp_directory(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / "real"
            target.mkdir()
            alias = Path(temporary) / "alias"
            alias.symlink_to(target, target_is_directory=True)
            with patch.object(workspace.tempfile, "gettempdir", return_value=str(alias)):
                work = WorkWorkspace()
            try:
                self.assertEqual(work.root, target.resolve() / "RootLens-Import-Cache")
            finally:
                work.close()
