"""Windowed application entry point for packaged desktop builds."""

import os
from pathlib import Path
import sys


def configure_diagnostic_output():
    """Windowed Windows executables have no inherited Python output streams."""
    if sys.argv[1:2] == ["--diagnostic-output"]:
        if len(sys.argv) < 3:
            return False
        destination = Path(sys.argv[2])
        try:
            descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            stream = os.fdopen(descriptor, "w", encoding="utf-8", buffering=1)
        except OSError:
            return False
        sys.stdout = sys.stderr = stream
        del sys.argv[1:3]
    for name in ("stdout", "stderr"):
        if getattr(sys, name) is None:
            setattr(sys, name, open(os.devnull, "w", encoding="utf-8"))
    return True


if __name__ == "__main__":
    if not configure_diagnostic_output():
        sys.exit(2)
    if sys.argv[1:2] == ["--cli"]:
        from rootlens_import.core import main
        sys.exit(main(sys.argv[2:]))
    if sys.argv[1:2] == ["--check-media"]:
        if os.name == "nt":
            print('{"stage":"launcher"}', flush=True)
        from media_check import main
        sys.exit(main(sys.argv[2:]))
    if sys.argv[1:2] == ["--check-runtime"]:
        from runtime_check import main
        sys.exit(main(sys.argv[2:]))
    if sys.argv[1:2] == ["--check-browser"]:
        from browser_check import main
        sys.exit(main(sys.argv[2:]))
    from rootlens_import.desktop import main
    sys.exit(main())
