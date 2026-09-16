"""Render the bundled Lucide icon assets at the size and color of each control."""

from functools import lru_cache
from pathlib import Path

from PySide6.QtCore import QByteArray, Qt
from PySide6.QtGui import QIcon, QPainter, QPixmap
from PySide6.QtSvg import QSvgRenderer


ASSETS = Path(__file__).with_name("assets") / "lucide"


@lru_cache(maxsize=64)
def icon(name, color="#202020", size=24):
    source = (ASSETS / f"{name}.svg").read_bytes().replace(b"currentColor", color.encode("ascii"))
    renderer = QSvgRenderer(QByteArray(source))
    if not renderer.isValid():
        raise ValueError(f"Invalid icon asset: {name}")
    pixmap = QPixmap(size * 2, size * 2)
    pixmap.fill(Qt.GlobalColor.transparent)
    painter = QPainter(pixmap)
    renderer.render(painter)
    painter.end()
    pixmap.setDevicePixelRatio(2)
    return QIcon(pixmap)
