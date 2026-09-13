package io.rootlens.mentra;

import android.content.Context;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureFailure;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.TotalCaptureResult;
import android.media.MediaRecorder;
import android.os.Handler;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.file.Files;

/** Executes the production CaptureEngine against fault-injectable Android boundaries. */
public final class CaptureEngineFaultTest {
    private static int assertions;

    private static final class Listener implements CaptureEngine.Listener {
        int started;
        int completed;
        int cancelled;
        int failed;
        Throwable error;

        public void onStarted(File directory, DeviceProbe.Snapshot probe) { started++; }
        public void onCompleted(File directory) { completed++; }
        public void onCancelled(File directory) { cancelled++; }
        public void onFailed(File directory, Throwable failure) {
            failed++;
            error = failure;
        }
    }

    private record Fixture(CaptureEngine engine, Listener listener, MediaRecorder recorder) {}

    private static Fixture opening() throws Exception {
        Handler.reset();
        System.setProperty("harness.data", Files.createTempDirectory("capture-engine-test-").toString());
        Listener listener = new Listener();
        CaptureEngine engine = new CaptureEngine(new Context(), 1800, 7_000_000, listener);
        engine.start();
        Handler.drain();
        check(MediaRecorder.latest.constructedOnHandler, "Recorder is created on the camera handler");
        return new Fixture(engine, listener, MediaRecorder.latest);
    }

    private static CameraDevice opened() {
        CameraDevice camera = new CameraDevice();
        CameraManager.callback.onOpened(camera);
        Handler.drain();
        return camera;
    }

    private static CameraCaptureSession recording() {
        CameraDevice camera = opened();
        CameraCaptureSession session = new CameraCaptureSession();
        camera.sessionCallback.onConfigured(session);
        Handler.drain();
        return session;
    }

    private static SessionArtifacts artifacts(Fixture fixture) throws Exception {
        Field field = CaptureEngine.class.getDeclaredField("artifacts");
        field.setAccessible(true);
        return (SessionArtifacts) field.get(fixture.engine());
    }

    private static void check(boolean condition, String message) {
        assertions++;
        if (!condition) throw new AssertionError(message);
    }

    private static void sessionSetupExceptions() throws Exception {
        for (RuntimeException failure : new RuntimeException[] {
                new IllegalArgumentException("Unsupported output surface"),
                new IllegalStateException("Camera closed")}) {
            Fixture fixture = opening();
            CameraDevice camera = new CameraDevice();
            camera.createFailure = failure;
            CameraManager.callback.onOpened(camera);
            Handler.drain();
            check(fixture.listener().failed == 1, "Session runtime failure is reported once");
            check(fixture.recorder().released && camera.closed, "Session failure releases hardware");
            check(fixture.listener().error == failure, "Original SDK failure is preserved");
        }
        Fixture fixture = opening();
        fixture.recorder().surfaceFailure = new IllegalStateException("Recorder unavailable");
        opened();
        check(fixture.listener().failed == 1 && fixture.recorder().released,
                "Recorder surface runtime failure cannot escape the camera callback");
    }

    private static void cancelledBeforeRecording() throws Exception {
        Fixture fixture = opening();
        fixture.engine().stop();
        Handler.drain();
        check(fixture.listener().cancelled == 0, "Pending camera ownership is retained until callback");
        CameraDevice camera = opened();
        check(fixture.listener().started == 0 && fixture.listener().cancelled == 1,
                "STOP before onOpened is a cancellation");
        check(fixture.listener().failed == 0 && artifacts(fixture).discardCount == 1,
                "Cancellation discards only this not-started capture");
        check(camera.closed && fixture.recorder().released, "Cancellation releases hardware");

        fixture = opening();
        camera = opened();
        fixture.engine().stop();
        Handler.drain();
        CameraCaptureSession lateSession = new CameraCaptureSession();
        camera.sessionCallback.onConfigured(lateSession);
        check(fixture.listener().cancelled == 1 && fixture.listener().started == 0 && lateSession.closed,
                "STOP during configuration cancels; late configured callback cannot start recording");

        fixture = opening();
        artifacts(fixture).discardFailure = new IOException("Cannot remove scratch file");
        fixture.engine().stop();
        Handler.drain();
        opened();
        check(fixture.listener().cancelled == 0 && fixture.listener().failed == 1,
                "Scratch cleanup failure is not reported as cancellation");

        fixture = opening();
        fixture.recorder().releaseFailure = new IllegalStateException("Recorder release failed");
        fixture.engine().stop();
        Handler.drain();
        opened();
        check(fixture.listener().cancelled == 0 && fixture.listener().failed == 1
                        && artifacts(fixture).discardCount == 0,
                "Hardware cleanup failure preserves the unfinished capture");

        fixture = opening();
        fixture.engine().stop();
        fixture.recorder().emitError(1, 28);
        Handler.drain();
        opened();
        check(fixture.listener().cancelled == 0 && fixture.listener().failed == 1,
                "Recorder error during pending STOP cannot be disguised as cancellation");
    }

    private static void recordingErrors() throws Exception {
        Fixture fixture = opening();
        recording();
        fixture.recorder().emitError(100, 42);
        Handler.drain();
        check(fixture.listener().failed == 1 && fixture.recorder().released,
                "Asynchronous media-server failure terminates and releases recording");
        check(fixture.listener().error.getMessage().contains("what=100, extra=42"),
                "Recorder diagnostic codes are retained");
        fixture.recorder().emitError(100, 42);
        fixture.engine().stop();
        Handler.drain();
        Handler.advanceBy(20_000);
        check(fixture.listener().failed == 1 && fixture.listener().cancelled == 0,
                "Late recorder errors, STOP, and watchdog cannot report a second terminal result");

        fixture = opening();
        recording();
        fixture.recorder().stopFailure = new RuntimeException("No valid audio/video data");
        fixture.engine().stop();
        Handler.drain();
        check(fixture.listener().failed == 1 && fixture.listener().cancelled == 0,
                "Recorder-started STOP failure remains a real failure");
        check(artifacts(fixture).discardCount == 0 && fixture.recorder().released,
                "Started recording is retained on failure while hardware is released");

        fixture = opening();
        recording();
        fixture.engine().stop();
        Handler.drain();
        check(fixture.listener().completed == 1 && fixture.listener().cancelled == 0,
                "Normal recording STOP still finalizes");
    }

    private static void callbackStalls() throws Exception {
        Fixture fixture = opening();
        recording();
        Handler.advanceBy(9_999);
        check(fixture.listener().failed == 0, "First frame has a bounded grace period");
        Handler.advanceBy(1_001);
        check(fixture.listener().failed == 1 && fixture.recorder().released,
                "No first frame terminates recording");

        fixture = opening();
        CameraCaptureSession session = recording();
        CaptureRequest request = new CaptureRequest();
        for (int n = 0; n < 3; n++) {
            Handler.advanceBy(5_000);
            TotalCaptureResult result = new TotalCaptureResult();
            result.number = n;
            result.timestamp = (n + 1) * 5_000_000_000L;
            session.captureCallback.onCaptureCompleted(session, request, result);
            Handler.drain();
        }
        check(fixture.listener().failed == 0, "Successful frames renew the stall deadline");
        Handler.advanceBy(10_001);
        check(fixture.listener().failed == 1, "Complete callback silence after valid recording is detected");

        fixture = opening();
        session = recording();
        for (int n = 0; n < 300; n++) {
            session.captureCallback.onCaptureStarted(session, request, n, n);
            session.captureCallback.onCaptureFailed(session, request, new CaptureFailure(n));
        }
        Handler.advanceBy(10_001);
        check(fixture.listener().failed == 1,
                "Repeated failed captures do not disguise the absence of complete frames");

        fixture = opening();
        Handler.advanceBy(10_001);
        CameraDevice lateCamera = opened();
        check(fixture.listener().failed == 1 && lateCamera.closed,
                "Camera-open timeout and late callback preserve one terminal failure");
    }

    public static void main(String[] args) throws Exception {
        sessionSetupExceptions();
        cancelledBeforeRecording();
        recordingErrors();
        callbackStalls();
        System.out.println("CaptureEngine fault tests passed (" + assertions + " assertions)");
    }
}
