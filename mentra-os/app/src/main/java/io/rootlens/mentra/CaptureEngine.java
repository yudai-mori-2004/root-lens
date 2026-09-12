package io.rootlens.mentra;

import android.annotation.SuppressLint;
import android.content.Context;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureFailure;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.TotalCaptureResult;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.util.Log;
import android.util.Range;
import android.view.Surface;

import java.io.File;
import java.io.IOException;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

final class CaptureEngine {
    interface Listener {
        void onStarted(File directory, DeviceProbe.Snapshot probe);
        void onCompleted(File directory);
        void onCancelled(File directory);
        void onFailed(File directory, Throwable error);
    }

    private static final String TAG = "RootLensCapture";
    // Camera2 callbacks are asynchronous. Bound the time the service owns the camera gate when
    // a driver never answers openCamera or createCaptureSession.
    private static final long CAMERA_SETUP_TIMEOUT_MS = 10_000L;
    private static final long FRAME_STALL_TIMEOUT_MS = 10_000L;
    private static final long FRAME_WATCHDOG_INTERVAL_MS = 1_000L;

    private final Context context;
    private final long requestedDurationSeconds;
    private final int bitrateBps;
    private final boolean calibrationCapture;
    private final Listener listener;
    private final HandlerThread cameraThread = new HandlerThread("rootlens-camera");
    private final AtomicBoolean terminal = new AtomicBoolean();
    private final Map<Long, StartedFrame> startedFrames = new HashMap<>();

    private Handler cameraHandler;
    private DeviceProbe.Snapshot probe;
    private VideoImuCalibration calibration;
    private SessionArtifacts artifacts;
    private RawImuRecorder rawImu;
    private MediaRecorder recorder;
    private CameraDevice cameraDevice;
    private CameraCaptureSession captureSession;
    private boolean cameraOpenPending;
    private Runnable cameraSetupTimeout;
    private Runnable frameWatchdog;
    private long lastCompleteFrameElapsedNs;
    private boolean stopRequested;
    private boolean recorderStarted;
    private volatile boolean acceptFrames;
    private long recorderStartWallMs;
    private long recorderStartElapsedNs;
    private long recorderStartMonotonicNs;
    private int captureFailureCount;

    CaptureEngine(Context context, long requestedDurationSeconds, int bitrateBps, Listener listener) {
        this(context, requestedDurationSeconds, bitrateBps, false, listener);
    }

    CaptureEngine(
            Context context,
            long requestedDurationSeconds,
            int bitrateBps,
            boolean calibrationCapture,
            Listener listener) {
        this.context = context.getApplicationContext();
        this.requestedDurationSeconds = requestedDurationSeconds;
        this.bitrateBps = bitrateBps;
        this.calibrationCapture = calibrationCapture;
        this.listener = listener;
    }

    @SuppressLint("MissingPermission")
    void start() throws IOException, CameraAccessException {
        if (cameraHandler != null) throw new IOException("Capture engine cannot be reused");
        try {
            probe = DeviceProbe.inspect(context);
            calibration = CalibrationStore.resolve(context, probe.cameraId);
            File external = context.getExternalFilesDir(null);
            if (external == null) {
                throw new IOException("External recording storage unavailable");
            }
            File root = new File(external, "recordings");
            if (!root.isDirectory() && !root.mkdirs()) {
                throw new IOException("Cannot create recording directory: " + root);
            }
            artifacts = calibrationCapture
                    ? SessionArtifacts.createCalibration(root)
                    : SessionArtifacts.create(root);
            rawImu = new RawImuRecorder(context);
            rawImu.start(artifacts.partialImu);

            cameraThread.start();
            cameraHandler = new Handler(cameraThread.getLooper());
            if (!cameraHandler.post(this::openCamera)) {
                throw new IOException("Camera worker stopped before camera initialization");
            }
        } catch (IOException | RuntimeException error) {
            failNow(error);
            throw error;
        }
    }

    @SuppressLint("MissingPermission")
    private void openCamera() {
        if (terminal.get()) return;
        try {
            prepareRecorder();
            CameraManager manager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
            cameraOpenPending = true;
            cameraSetupTimeout = () -> {
                if (!terminal.get() && (cameraOpenPending || captureSession == null)) {
                    failNow(new IOException("Camera setup timed out"));
                }
            };
            cameraHandler.postDelayed(cameraSetupTimeout, CAMERA_SETUP_TIMEOUT_MS);
            manager.openCamera(probe.cameraId, cameraStateCallback, cameraHandler);
        } catch (IOException | CameraAccessException | RuntimeException error) {
            cameraOpenPending = false;
            cancelCameraSetupTimeout();
            failNow(error);
        }
    }

    void stop() {
        Handler handler = cameraHandler;
        if (handler == null) {
            fail(new IOException("Capture was stopped before camera initialization"));
            return;
        }
        if (!handler.post(() -> {
            stopRequested = true;
            if (!cameraOpenPending) stopInternal();
        })) {
            failNow(new IOException("Camera worker stopped before capture was finalized"));
        }
    }

    File directory() {
        return artifacts == null ? null : artifacts.directory;
    }

    private void prepareRecorder() throws IOException {
        recorder = new MediaRecorder();
        recorder.setOnErrorListener((source, what, extra) -> fail(new IOException(
                "MediaRecorder error: what=" + what + ", extra=" + extra)));
        boolean recordAudio = !calibrationCapture;
        if (recordAudio) recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
        recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
        recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        if (recordAudio) {
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioSamplingRate(AppContract.AUDIO_SAMPLE_RATE_HZ);
            recorder.setAudioChannels(AppContract.AUDIO_CHANNELS);
            recorder.setAudioEncodingBitRate(AppContract.AUDIO_BITRATE_BPS);
        }
        recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
        recorder.setVideoEncodingBitRate(bitrateBps);
        recorder.setVideoFrameRate(AppContract.FPS);
        recorder.setVideoSize(AppContract.WIDTH, AppContract.HEIGHT);
        recorder.setOrientationHint(0);
        recorder.setOutputFile(artifacts.partialVideo.getAbsolutePath());
        recorder.prepare();
    }

    private final CameraDevice.StateCallback cameraStateCallback = new CameraDevice.StateCallback() {
        @Override
        public void onOpened(CameraDevice camera) {
            cameraOpenPending = false;
            if (terminal.get()) {
                cancelCameraSetupTimeout();
                try {
                    camera.close();
                } catch (RuntimeException error) {
                    Log.w(TAG, "Could not close a late camera callback", error);
                }
                return;
            }
            cameraDevice = camera;
            if (stopRequested) {
                stopInternal();
                return;
            }
            try {
                Surface recorderSurface = recorder.getSurface();
                camera.createCaptureSession(
                        Collections.singletonList(recorderSurface), sessionStateCallback, cameraHandler);
            } catch (CameraAccessException | RuntimeException error) {
                fail(error);
            }
        }

        @Override
        public void onDisconnected(CameraDevice camera) {
            cameraOpenPending = false;
            cancelCameraSetupTimeout();
            closeFailedCamera(camera, new IOException("Camera disconnected"));
        }

        @Override
        public void onError(CameraDevice camera, int error) {
            cameraOpenPending = false;
            cancelCameraSetupTimeout();
            closeFailedCamera(camera, new IOException("CameraDevice error " + error));
        }
    };

    private final CameraCaptureSession.StateCallback sessionStateCallback =
            new CameraCaptureSession.StateCallback() {
                @Override
                public void onConfigured(CameraCaptureSession session) {
                    if (terminal.get() || cameraDevice == null) {
                        try {
                            session.close();
                        } catch (RuntimeException error) {
                            Log.w(TAG, "Could not close a late session callback", error);
                        }
                        return;
                    }
                    captureSession = session;
                    try {
                        CaptureRequest.Builder builder = cameraDevice.createCaptureRequest(
                                CameraDevice.TEMPLATE_RECORD);
                        builder.addTarget(recorder.getSurface());
                        builder.set(CaptureRequest.CONTROL_CAPTURE_INTENT,
                                CaptureRequest.CONTROL_CAPTURE_INTENT_VIDEO_RECORD);
                        builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
                        builder.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,
                                new Range<>(AppContract.FPS, AppContract.FPS));
                        Range<Float> zoomRange = probe.characteristics.get(
                                CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE);
                        if (zoomRange != null && zoomRange.contains(1.0f)) {
                            builder.set(CaptureRequest.CONTROL_ZOOM_RATIO, 1.0f);
                        }
                        builder.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE,
                                CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_OFF);
                        setOpticalStabilizationOff(builder);
                        builder.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_OFF);
                        session.setRepeatingRequest(builder.build(), captureCallback, cameraHandler);

                        recorder.start();
                        recorderStarted = true;
                        recorderStartWallMs = System.currentTimeMillis();
                        recorderStartElapsedNs = SystemClock.elapsedRealtimeNanos();
                        recorderStartMonotonicNs = System.nanoTime();
                        acceptFrames = true;
                        cancelCameraSetupTimeout();
                        startFrameWatchdog();
                        listener.onStarted(artifacts.directory, probe);
                    } catch (CameraAccessException | RuntimeException error) {
                        fail(error);
                    }
                }

                @Override
                public void onConfigureFailed(CameraCaptureSession session) {
                    cancelCameraSetupTimeout();
                    Throwable failure = new IOException("Camera capture session configuration failed");
                    try {
                        session.close();
                    } catch (RuntimeException error) {
                        failure = withFailure(failure, error);
                    }
                    fail(failure);
                }
            };

    private final CameraCaptureSession.CaptureCallback captureCallback =
            new CameraCaptureSession.CaptureCallback() {
                @Override
                public void onCaptureStarted(
                        CameraCaptureSession session, CaptureRequest request, long timestamp, long frameNumber) {
                    if (!acceptFrames) return;
                    startedFrames.put(frameNumber, new StartedFrame(timestamp));
                    if (startedFrames.size() > AppContract.FPS * 4) {
                        fail(new IOException("Camera frame results stopped arriving"));
                    }
                }

                @Override
                public void onCaptureCompleted(
                        CameraCaptureSession session, CaptureRequest request, TotalCaptureResult result) {
                    if (!acceptFrames) return;
                    Long sensorTimestamp = result.get(TotalCaptureResult.SENSOR_TIMESTAMP);
                    if (sensorTimestamp == null) {
                        fail(new IOException("CaptureResult is missing SENSOR_TIMESTAMP"));
                        return;
                    }
                    long frameNumber = result.getFrameNumber();
                    StartedFrame started = startedFrames.remove(frameNumber);
                    SessionArtifacts.FrameRecord frame = new SessionArtifacts.FrameRecord();
                    frame.frameNumber = frameNumber;
                    frame.sensorTimestampNs = sensorTimestamp;
                    frame.captureStartedTimestampNs = started == null ? sensorTimestamp : started.timestampNs;
                    frame.callbackElapsedRealtimeNs = SystemClock.elapsedRealtimeNanos();
                    frame.callbackMonotonicNs = System.nanoTime();
                    Long exposure = result.get(TotalCaptureResult.SENSOR_EXPOSURE_TIME);
                    Long duration = result.get(TotalCaptureResult.SENSOR_FRAME_DURATION);
                    Long skew = result.get(TotalCaptureResult.SENSOR_ROLLING_SHUTTER_SKEW);
                    Integer sensitivity = result.get(TotalCaptureResult.SENSOR_SENSITIVITY);
                    if (exposure != null) frame.exposureTimeNs = exposure;
                    if (duration != null) frame.frameDurationNs = duration;
                    if (skew != null) frame.rollingShutterSkewNs = skew;
                    if (sensitivity != null) frame.sensitivityIso = sensitivity;
                    try {
                        if (rawImu.writeFailure() != null) throw rawImu.writeFailure();
                        artifacts.addCameraFrame(frame);
                        lastCompleteFrameElapsedNs = SystemClock.elapsedRealtimeNanos();
                    } catch (IOException error) {
                        fail(error);
                    }
                }

                @Override
                public void onCaptureFailed(
                        CameraCaptureSession session, CaptureRequest request, CaptureFailure failure) {
                    startedFrames.remove(failure.getFrameNumber());
                    captureFailureCount++;
                    Log.e(TAG, "Camera frame failed: reason=" + failure.getReason()
                            + " frame=" + failure.getFrameNumber());
                }
            };

    private void closeFailedCamera(CameraDevice camera, Throwable failure) {
        try {
            camera.close();
        } catch (RuntimeException error) {
            failure = withFailure(failure, error);
        }
        fail(failure);
    }

    private void startFrameWatchdog() {
        lastCompleteFrameElapsedNs = SystemClock.elapsedRealtimeNanos();
        frameWatchdog = new Runnable() {
            @Override
            public void run() {
                if (terminal.get() || !acceptFrames) return;
                long silentNs = SystemClock.elapsedRealtimeNanos() - lastCompleteFrameElapsedNs;
                if (silentNs >= FRAME_STALL_TIMEOUT_MS * 1_000_000L) {
                    failNow(new IOException("Camera stopped producing complete frame results"));
                    return;
                }
                cameraHandler.postDelayed(this, FRAME_WATCHDOG_INTERVAL_MS);
            }
        };
        cameraHandler.postDelayed(frameWatchdog, FRAME_WATCHDOG_INTERVAL_MS);
    }

    private void cancelFrameWatchdog() {
        if (cameraHandler != null && frameWatchdog != null) {
            cameraHandler.removeCallbacks(frameWatchdog);
        }
        frameWatchdog = null;
    }

    private void setOpticalStabilizationOff(CaptureRequest.Builder builder) {
        int[] modes = probe.characteristics.get(
                CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION);
        if (modes == null) return;
        for (int mode : modes) {
            if (mode == CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_OFF) {
                builder.set(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE,
                        CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_OFF);
                return;
            }
        }
    }

    private void stopInternal() {
        if (!terminal.compareAndSet(false, true)) return;
        cancelCameraSetupTimeout();
        cancelFrameWatchdog();
        long stopWallMs = System.currentTimeMillis();
        boolean hadRecording = recorderStarted;
        Throwable failure = stopHardware(null);
        if (stopRequested && !hadRecording) {
            failure = closeArtifacts(failure);
            if (failure == null) {
                try {
                    artifacts.discardCancelled();
                } catch (IOException error) {
                    failure = error;
                }
            }
            cameraThread.quitSafely();
            if (failure == null) {
                listener.onCancelled(directory());
            } else {
                if (artifacts != null) artifacts.failClip(failure);
                listener.onFailed(directory(), failure);
            }
            return;
        }
        File completed = null;
        try {
            if (failure != null) throw failure;
            if (captureFailureCount > 0) {
                SessionArtifacts.writeText(new File(artifacts.directory, "camera_capture_failures.txt"),
                        Integer.toString(captureFailureCount) + "\n");
            }
            completed = artifacts.finalizeClip(
                    probe, rawImu, requestedDurationSeconds, bitrateBps,
                    recorderStartWallMs, recorderStartElapsedNs, recorderStartMonotonicNs,
                    stopWallMs, hadRecording, calibration, !calibrationCapture);
        } catch (Throwable error) {
            failure = error;
        } finally {
            failure = closeArtifacts(failure);
            cameraThread.quitSafely();
        }
        if (failure == null) {
            artifacts.discardScratchIndexes();
            listener.onCompleted(completed);
        } else {
            if (artifacts != null) artifacts.failClip(failure);
            listener.onFailed(directory(), failure);
        }
    }

    private void fail(Throwable error) {
        Handler handler = cameraHandler;
        if (handler != null && Thread.currentThread() != cameraThread) {
            if (handler.post(() -> failNow(error))) return;
        }
        failNow(error);
    }

    private void failNow(Throwable error) {
        if (!terminal.compareAndSet(false, true)) return;
        cancelCameraSetupTimeout();
        cancelFrameWatchdog();
        Throwable failure = stopHardware(error);
        failure = closeArtifacts(failure);
        if (artifacts != null) artifacts.failClip(failure);
        if (cameraHandler != null) cameraThread.quitSafely();
        listener.onFailed(directory(), failure);
    }

    private void cancelCameraSetupTimeout() {
        if (cameraSetupTimeout == null || cameraHandler == null) return;
        cameraHandler.removeCallbacks(cameraSetupTimeout);
        cameraSetupTimeout = null;
    }

    /** Release every hardware resource even when MediaRecorder.stop or a driver throws. */
    private Throwable stopHardware(Throwable failure) {
        acceptFrames = false;
        CameraCaptureSession session = captureSession;
        captureSession = null;
        if (session != null) {
            try {
                session.stopRepeating();
                session.abortCaptures();
            } catch (CameraAccessException | RuntimeException error) {
                Log.w(TAG, "Could not drain camera session", error);
            } finally {
                try {
                    session.close();
                } catch (RuntimeException error) {
                    failure = withFailure(failure, error);
                }
            }
        }
        CameraDevice camera = cameraDevice;
        cameraDevice = null;
        if (camera != null) {
            try {
                camera.close();
            } catch (RuntimeException error) {
                failure = withFailure(failure, error);
            }
        }
        MediaRecorder activeRecorder = recorder;
        recorder = null;
        if (activeRecorder != null) {
            try {
                if (recorderStarted) activeRecorder.stop();
            } catch (RuntimeException error) {
                failure = withFailure(failure, error);
            } finally {
                recorderStarted = false;
                try {
                    activeRecorder.reset();
                } catch (RuntimeException error) {
                    Log.w(TAG, "Could not reset media recorder", error);
                }
                try {
                    activeRecorder.release();
                } catch (RuntimeException error) {
                    failure = withFailure(failure, error);
                }
            }
        }
        if (rawImu != null) {
            try {
                rawImu.stop();
                if (rawImu.writeFailure() != null) failure = withFailure(failure, rawImu.writeFailure());
            } catch (RuntimeException error) {
                failure = withFailure(failure, error);
            }
        }
        startedFrames.clear();
        return failure;
    }

    private Throwable closeArtifacts(Throwable failure) {
        if (rawImu != null) {
            try {
                rawImu.close();
            } catch (RuntimeException error) {
                failure = withFailure(failure, error);
            }
        }
        if (artifacts != null) {
            try {
                artifacts.close();
            } catch (IOException error) {
                failure = withFailure(failure, error);
            }
        }
        return failure;
    }

    private static Throwable withFailure(Throwable first, Throwable next) {
        if (first == null) return next;
        if (first != next) first.addSuppressed(next);
        return first;
    }

    private static final class StartedFrame {
        final long timestampNs;

        StartedFrame(long timestampNs) {
            this.timestampNs = timestampNs;
        }
    }
}
