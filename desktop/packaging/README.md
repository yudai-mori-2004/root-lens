# Desktop release builds

The application bundles Python, PySide6/Qt, Google authentication, HTTPS upload libraries and the ADB client. Staff install the resulting app once;
they do not install developer tools or run shell commands. Its site profile is selected on
first launch and is not embedded in the executable.

The CLI in `../scripts/import-recordings.py` and the desktop window share
`../rootlens_import/core.py`. USB selection uses the ADB local server's `host:tport:usb`
protocol and pins the returned transport ID. Windows' human-readable `devices -l` output
does not reliably contain a USB path.

## Build dependencies

- Python 3.12 on macOS, or Python 3.13 on Windows (CI pins 3.13.15).
  PySide6 6.11.2 requires macOS 13 or later on Mac.
- `python -m pip install -r requirements-build.txt` in an isolated build environment.
- An existing local Android Platform-Tools **37.0.0** installation with its notices.
- A directory containing the selected Python/Qt distribution's notices and notices for
  its bundled native libraries, including the PyInstaller bootloader and Qt Multimedia's FFmpeg notices.
- Windows installer builds additionally use Inno Setup 7.1.0 (the build workflow pins its installer and checksum).

`build.py` does not download Platform-Tools or accept license agreements. It copies only
ADB and its required Windows DLLs, includes the supplied complete `NOTICE.txt`, and records
the source binary hashes and build runtime versions in `runtime-manifest.json`.
It checks every version in `requirements-build.txt` and includes the installed authentication
and HTTP packages' license files in the bundle's third-party notices.
Review the [ADB Apache 2.0 notice](https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/NOTICE)
and the third-party notices accompanying the selected binary distribution. The
[SDK license's section 3.5](https://developer.android.com/tools/releases/platform-tools)
states that open-source components are governed by their open-source licenses.

PySide6 and the Qt modules used by this app are loaded as separate LGPL libraries. Keep
their LGPL license texts, upstream source locations, and Qt's module-specific third-party
attributions in the runtime notices directory. The FFmpeg backend also needs its LGPL
2.1-or-later and component notices. See [Qt's licensing and attribution index](https://doc.qt.io/qt-6/licenses-used-in-qt.html).
Only Qt Widgets and Multimedia are used; the build excludes Tk and Qt WebEngine.

## Application identity

The app, installer and shortcuts display **RootLens**. The executable name, Mac bundle
filename, Windows installation directory and application-data directory remain **RootLens Import**
so updates retain existing settings and recordings. The Windows installer replaces the old
RootLens Import shortcuts with RootLens shortcuts.

`rootlens_import/assets/rootlens.png` is an exact copy of the existing `mobile/assets/icon.png`.
`packaging/generate-icons.py` uses the pinned Qt 6.11.2 runtime to resize this same image into
PNG-backed `.ico` and `.icns` containers. No logo is redrawn. Run it from the repository when
the source logo changes; `packaging/icons/manifest.json` records the source and output hashes.
The regular build verifies these committed assets without needing the original mobile-app tree.
The frozen runtime check verifies the bundled PNG, and Windows acceptance extracts every
EXE icon resource, compares it with the `.ico` input, and saves a 256-pixel PNG for visual review.

## macOS

```sh
python packaging/build.py --platform-tools /path/to/platform-tools --output /path/to/build-output --runtime-notices /path/to/runtime-notices
```

Run from `desktop/`. This produces `RootLens Import.app`. Copy it to Applications
for local acceptance testing. The build architecture follows the Python runtime; an
arm64 build must not be labeled as supporting Intel Macs.

Create a disk image with the app and an Applications shortcut:

```sh
python packaging/package-macos.py --app '/path/to/build-output/RootLens Import.app' --output /path/to/installers
```

The disk image uses the neutral filename `RootLens-Import-VERSION-macOS-ARCH.dmg` and includes
installation instructions. The filename makes no claim about signing or notarization.
The `.dmg.manifest.json` sidecar records its checksum, actual signature type and whether
Gatekeeper and a stapled notarization ticket were verified. Default packaging checks signature
integrity and records the distribution checks as `not-checked`.
The optional `--release` mode requires Gatekeeper acceptance and a stapled notarization ticket
before producing the image; rejection stops packaging.

When Developer ID distribution is explicitly required, set `ROOTLENS_CODESIGN_IDENTITY` to an available **Developer ID Application**
identity, build, notarize with `xcrun notarytool`, staple the ticket, and verify Gatekeeper
acceptance of the downloaded artifact on a clean Mac. An Apple Development or ad-hoc
signature is not a substitute for this release step. See
[Apple's distribution guidance](https://developer.apple.com/developer-id/).
PyInstaller propagates this identity to the bundled native libraries and ADB, signs with
hardened runtime enabled, then signs the app bundle. The build treats a bundle-signing failure
as an error when an identity is supplied. Notarization and ticket stapling are separate steps.

## Windows

```powershell
python -m pip install -r packaging/requirements-build.txt
./packaging/build-windows.ps1 -Python python -PlatformTools C:/Android/platform-tools -Output C:/build/rootlens -RuntimeNotices C:/build/runtime-notices -InnoSetupCompiler 'C:/Program Files (x86)/Inno Setup 7/ISCC.exe'
```

Build with Python 3.13 x64 on Windows. PyInstaller cannot produce a Windows executable on macOS.
The optional Inno Setup step creates a per-user installer with a Start Menu shortcut
and optional desktop shortcut; it does not require administrator rights for the app.
The executable and installer versions come from `rootlens_import.__version__`.
The installer supports Windows 10 version 1809 or later and Windows 11 x64, matching
[Qt 6.11's supported Windows configurations](https://doc.qt.io/qt-6/windows.html).
`windows-build-manifest.json` records the application's and installer's actual Authenticode
status and signer, alongside the version, file size and checksum. An unsigned installer
is recorded as `NotSigned`; the normal filename does not assert that it is signed.

Sign releases using the organization's signing service. Even a new signed app may have
SmartScreen prompts until it develops reputation. See
[Microsoft's guidance](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).
### Windows acceptance automation

On a disposable Windows CI runner, after the application tests and build:

```powershell
./packaging/verify-windows.ps1 -Python python -BundleDir 'C:/build/rootlens/RootLens Import' -Installer 'C:/build/rootlens/RootLens-Import-Setup-0.4.2-windows-x64.exe' -SampleVideo packaging/fixtures/kitchen-demo.mp4 -Output C:/build/evidence
```

`verify_windows.py` requires `CI=true` and refuses to install if RootLens is already
registered for the current Windows user. It installs to a unique temporary directory,
uses isolated app-data paths, and keeps existing site settings and recordings out of the
test. It checks the bundle and installed copy with Python and ADB removed from PATH:

- Bundled ADB version, certificate bundle, OS credential-store client, and an unauthenticated
  HTTPS request to the RootLens session API that must return HTTP 401.
- Bundled logo integrity and actual executable icon resources, with an exported icon PNG.
- Frozen H.264 video and AAC audio decoding; frozen CLI argument handling and UTF-8 output.
- GUI startup, silent per-user installation, executable equality, silent uninstall,
  and preservation of a synthetic app-data marker.

`windows-acceptance.json`, individual diagnostic logs, installer logs and screenshots
are written to the evidence directory. The driver and a physical Mentra connection are
separate acceptance checks; a passing CI job does not claim that actual USB capture was tested.

`capture-demo.py --sample-video <generated.mp4> --output <directory>` exports this app's
own Qt widgets and decoded video frame for the Windows guide. It creates isolated synthetic
recordings and uses a fake upload backend. Do not pass actual recordings. The capture keeps
the raw widget export, decoded frame and geometry manifest alongside each combined screen
because native video surfaces are not included in `QWidget.grab()` on every platform.

### First Windows USB connection

Use the Mentra Infinity Cable's data connection, attach its contacts to the right temple,
and connect it to the PC. Mentra's [official ADB instructions](https://github.com/Mentra-Community/MentraOS/blob/main/asg_client/README.md#connecting-via-adb)
describe the connection and ship the glasses with USB debugging enabled. Start the app and
press **接続**. Developers can diagnose the connection with the bundled
`_internal/rootlens_import/runtime/adb.exe devices` from the installed app directory.

Platform-Tools includes the ADB program and its Windows DLLs; it is not a universal USB
driver installer. The [Google USB Driver](https://developer.android.com/studio/run/win-usb)
is for Google devices, so do not prescribe it for Mentra. Windows can automatically use
its signed WinUSB driver when a device supplies the required
[Microsoft OS descriptors](https://learn.microsoft.com/en-us/windows-hardware/drivers/usbcon/automatic-installation-of-winusb),
but a successful Mentra ADB connection must be verified on Windows hardware.

If the glasses are absent, first check the cable and physical connection, then inspect the
device in Device Manager and try its automatic driver search or Windows Update following
[Microsoft's driver update procedure](https://support.microsoft.com/en-us/windows/update-drivers-through-device-manager-in-windows-ec62f46c-ff14-c91d-eead-d7126dc1f7b6).
If no compatible driver is found, record the device's hardware IDs and obtain a matching
signed package from Mentra support. An official Mentra-specific Windows download has not
been identified in the referenced public instructions. Do not modify an INF file, disable
signature enforcement, or replace a driver with a generic utility as part of the field guide.

## Release acceptance

Run core, library and desktop tests before building. On each supported OS, verify a
fresh installation without Python or ADB on PATH; missing-device feedback; import and
re-import; USB disconnect and cancellation; Explorer/Finder selection of the whole recording
folder; site-profile loading; embedded video and audio playback; previous/next navigation;
and login, upload, and server-side verification against a test site's restricted Drive destination.
Keep unverified platform artifacts out of the site's production app folder.

## Site access

Register each field supervisor with a site before using the app. The supervisor opens
**Googleでログイン** in the desktop settings, completes Google login in the system browser,
and returns to the app through an IPv4 loopback callback. The desktop stores only the opaque
RootLens session in the operating system credential store.

The site's Google Drive connection is configured separately by a site administrator. Its
refresh token is encrypted on the RootLens server. The desktop never receives a Google refresh
token, service-account key, or Drive folder ID. For an upload, the server issues resumable URLs
that can accept bytes for the selected files only, then independently verifies the files in Drive.

For maintainer smoke checks, the packaged executable accepts `--cli` followed by the
existing import command's options, including `--clip`. This exercises the same frozen
code and bundled ADB without copying every recording. Normal launches open the window.

The packaged executable also accepts `--check-media /path/to/synthetic-av.mp4`. This
read-only diagnostic opens the embedded player, mutes the output, and requires both a
valid decoded video frame and audio buffer. It exits 0 on success or 1 on a codec error
or 15-second timeout. Use a synthetic H.264/AAC clip to confirm that the frozen bundle
includes the Qt Multimedia backend and codecs. The check does not connect a device,
change site settings, or upload data.

On Windows, a windowed PyInstaller executable has no standard output streams. Prefix any
diagnostic with `--diagnostic-output <new-log-file>` to write UTF-8 output reliably, for example:

```powershell
& '.\RootLens Import.exe' --diagnostic-output C:/build/check-runtime.log --check-runtime
```

The diagnostic refuses to overwrite an existing output file. `--check-runtime` tests bundled
dependencies and the public RootLens authentication boundary; it does not read a site file,
use a login session, or connect to a recording device. See [PyInstaller's windowed-mode behavior](https://pyinstaller.org/en/stable/common-issues-and-pitfalls.html#sys-stdin-sys-stdout-and-sys-stderr-in-noconsole-windowed-applications-windows-only).
