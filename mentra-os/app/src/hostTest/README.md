# CaptureEngine host tests

Run `mentra-os/scripts/test-capture-engine.sh` from the repository root. Java 17 is
required; the Android SDK and a connected device are not required.

The script compiles the production `CaptureEngine.java` and `AppContract.java`
against the deterministic Android and artifact doubles in this directory.
`CaptureEngineFaultTest` injects camera setup exceptions, recorder error callbacks,
early cancellation, cleanup failures, late callbacks, and missing frame progress.
The fake Handler exposes a monotonic clock so timeout tests do not sleep.

These sources are outside Android's normal `main` and `test` source sets and are
never included in an APK. They test the engine's callback and resource ownership
paths. Codec output, real callback threading, filesystem finalization, and physical
camera/IMU behavior remain covered by their own checks and device tests.
