"""One app-owned browser session for RootLens login and recording approval."""

from pathlib import Path
import shutil
from urllib.parse import urlsplit

import shiboken6
from PySide6.QtCore import Qt, QUrl
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QDialog, QHBoxLayout, QLabel, QPushButton, QVBoxLayout

def forget_browser_session(directory):
    directory = Path(directory)
    for path in (directory, directory.with_name("browser-cache")):
        if path.is_symlink():
            path.unlink()
        elif path.exists():
            shutil.rmtree(path)


class RootLensBrowser(QDialog):
    def __init__(self, api_origin, storage_path, parent=None):
        super().__init__(parent)
        self.api_origin = api_origin
        storage_path = Path(storage_path)
        self.setWindowTitle("RootLens")
        self.setWindowModality(Qt.WindowModality.ApplicationModal)
        self.resize(820, 650)
        self.profile = QWebEngineProfile("RootLensImport", self)
        self.profile.setPersistentStoragePath(str(storage_path))
        self.profile.setCachePath(str(storage_path.with_name("browser-cache")))
        self.profile.setPersistentCookiesPolicy(
            QWebEngineProfile.PersistentCookiesPolicy.AllowPersistentCookies)
        self.view = QWebEngineView(self)
        self.view.setPage(QWebEnginePage(self.profile, self.view))
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        header = QHBoxLayout()
        header.setContentsMargins(20, 12, 20, 12)
        header.addWidget(QLabel("RootLens  ·  " + urlsplit(api_origin).netloc))
        header.addStretch()
        close = QPushButton("閉じる")
        close.clicked.connect(self.reject)
        header.addWidget(close)
        layout.addLayout(header)
        layout.addWidget(self.view, 1)

    def open_url(self, url):
        target = urlsplit(url)
        origin = urlsplit(self.api_origin)
        if (target.scheme, target.netloc) != (origin.scheme, origin.netloc):
            return False
        self.view.setUrl(QUrl(url))
        self.show()
        self.raise_()
        self.activateWindow()
        return True

    def dismiss(self):
        self.hide()

    def clear_session(self):
        self.dismiss()
        self.view.setUrl(QUrl("about:blank"))
        self.profile.cookieStore().deleteAllCookies()
        self.profile.clearHttpCache()

    def shutdown(self):
        if self.view is None:
            return
        self.dismiss()
        self.view.stop()
        shiboken6.delete(self.view)
        shiboken6.delete(self.profile)
        self.view = None
        self.profile = None
