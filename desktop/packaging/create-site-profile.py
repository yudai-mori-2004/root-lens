#!/usr/bin/env python3
"""Combine a site's destination and its dedicated service-account key for deployment."""

import argparse
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from rootlens_import.core import ImportFailure
from rootlens_import.site import SiteProfile, attach_service_account, save_site_profile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-id", required=True)
    parser.add_argument("--site-name", required=True)
    parser.add_argument("--folder-url", required=True)
    parser.add_argument("--service-account", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = args.output.expanduser()
    if output.exists() or output.is_symlink():
        parser.error("Output already exists. Choose a new path for the new configuration.")
    output = output.resolve()
    try:
        profile = attach_service_account(
            SiteProfile(args.site_id, args.site_name, args.folder_url),
            args.service_account.expanduser(),
        )
        save_site_profile(profile, output)
    except (ImportFailure, OSError):
        parser.exit(1, "Could not create the configuration. Check the inputs and destination permissions.\n")
    print(f"Saved {output}. Share it only inside this site's restricted folder.")


if __name__ == "__main__":
    main()
