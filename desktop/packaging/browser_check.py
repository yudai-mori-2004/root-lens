"""Confirm the packaged in-app browser renders and closes cleanly."""

import argparse
import json
from pathlib import Path
import sys
import tempfile

import shiboken6
from PySide6.QtCore import QEventLoop, QTimer
from PySide6.QtWidgets import QApplication

from rootlens_import.browser import RootLensBrowser


def main(arguments=None):
    argparse.ArgumentParser(description=__doc__).parse_args(arguments)
    own_app = QApplication.instance() is None
    app = QApplication.instance() or QApplication([])
    # Chromium may still hold its session-storage log when Qt closes on Windows.
    with tempfile.TemporaryDirectory(
        prefix="rootlens-browser-check-", ignore_cleanup_errors=sys.platform == "win32"
    ) as directory:
        browser = RootLensBrowser("https://www.rootlens.io", Path(directory) / "browser")
        loop = QEventLoop()
        loaded = []
        browser.view.loadFinished.connect(lambda ok: (loaded.append(ok), loop.quit()))
        browser.view.setHtml("<!doctype html><title>RootLens browser check</title><p>Ready</p>")
        QTimer.singleShot(10000, loop.quit)
        loop.exec()
        persistent = not browser.profile.isOffTheRecord()
        browser.shutdown()
        shiboken6.delete(browser)
        app.processEvents()
        if own_app:
            shiboken6.delete(app)
    success = loaded == [True] and persistent
    print(json.dumps({"ok": success, "web_engine_loaded": loaded == [True],
                      "persistent_profile": persistent}))
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
