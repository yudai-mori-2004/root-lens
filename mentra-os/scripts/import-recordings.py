#!/usr/bin/env python3
"""Compatibility command for the shared desktop import engine."""

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pc"))

from rootlens_import.core import main


if __name__ == "__main__":
    sys.exit(main())
