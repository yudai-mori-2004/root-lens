"""Read-only authentication and destination check for a packaged application."""

import argparse
import json
from pathlib import Path

from rootlens_import.core import ImportFailure
from rootlens_import.drive import DriveUploader
from rootlens_import.site import load_site_profile


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("profile", type=Path)
    args = parser.parse_args(argv)
    uploader = None
    try:
        uploader = DriveUploader(load_site_profile(args.profile))
        destination = uploader.validate_destination()
        print(json.dumps({"ok": True, "destination": destination["name"]}, ensure_ascii=False))
        return 0
    except (ImportFailure, OSError, ValueError):
        print(json.dumps({"ok": False, "error": "Could not authenticate or access the configured shared-drive folder."}))
        return 1
    finally:
        if uploader is not None:
            uploader.close()


if __name__ == "__main__":
    raise SystemExit(main())
