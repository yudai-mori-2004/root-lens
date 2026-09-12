"""Shared desktop identity and the bundled, unchanged RootLens logo."""

from pathlib import Path

from PySide6.QtGui import QIcon


APP_NAME = "RootLens"
ICON_PATH = Path(__file__).with_name("assets") / "rootlens.png"


def app_icon():
    return QIcon(str(ICON_PATH))
