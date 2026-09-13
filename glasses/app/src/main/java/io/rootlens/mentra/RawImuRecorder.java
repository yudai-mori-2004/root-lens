package io.rootlens.mentra;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.util.Log;

import java.io.BufferedWriter;
import java.io.Closeable;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

final class RawImuRecorder implements SensorEventListener, Closeable {
    private static final String TAG = "RootLensImu";

    private final SensorManager sensorManager;
    private final Sensor accelerometer;
    private final Sensor gyroscope;
    private final HandlerThread sensorThread = new HandlerThread("rootlens-imu");
    private final CountDownLatch closed = new CountDownLatch(1);

    private TimestampIndex accelTimestamps;
    private TimestampIndex gyroTimestamps;
    private Handler sensorHandler;
    private FileOutputStream output;
    private BufferedWriter writer;
    private volatile boolean recording;
    private volatile boolean closeRequested;
    private volatile IOException writeFailure;
    private boolean stopRequested;
    private int linesSinceFlush;

    RawImuRecorder(Context context) {
        sensorManager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        gyroscope = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
    }

    void start(File outputFile) throws IOException {
        if (accelerometer == null || gyroscope == null) {
            throw new IOException("Mentra capture requires both accelerometer and gyroscope");
        }
        if (sensorHandler != null || stopRequested) throw new IOException("IMU recorder cannot be reused");
        try {
            File parent = outputFile.getParentFile();
            if (parent == null) throw new IOException("IMU output has no parent directory");
            accelTimestamps = new TimestampIndex(new File(parent, "accelerometer_index.bin"));
            gyroTimestamps = new TimestampIndex(new File(parent, "gyroscope_index.bin"));
            output = new FileOutputStream(outputFile, false);
            writer = new BufferedWriter(new OutputStreamWriter(
                    output, StandardCharsets.UTF_8), 1024 * 1024);
            sensorThread.start();
            sensorHandler = new Handler(sensorThread.getLooper());
            recording = true;
            boolean accelRegistered = sensorManager.registerListener(
                    this, accelerometer, AppContract.IMU_PERIOD_US, 0, sensorHandler);
            boolean gyroRegistered = sensorManager.registerListener(
                    this, gyroscope, AppContract.IMU_PERIOD_US, 0, sensorHandler);
            if (!accelRegistered || !gyroRegistered) {
                throw new IOException("Failed to register raw IMU listeners");
            }
        } catch (IOException | RuntimeException error) {
            stop();
            throw error;
        }
    }

    void stop() {
        recording = false;
        sensorManager.unregisterListener(this);
        if (!stopRequested) {
            stopRequested = true;
            if (sensorHandler == null || !sensorHandler.post(this::finishStreams)) finishStreams();
        }
        try {
            if (!closed.await(5, TimeUnit.SECONDS)) {
                recordFailure(new IOException("Timed out while closing the IMU stream"));
            }
        } catch (InterruptedException interrupted) {
            recordFailure(new IOException("Interrupted while closing the IMU stream", interrupted));
            Thread.currentThread().interrupt();
        }
    }

    private void finishStreams() {
        try {
            if (writer != null) {
                try {
                    writer.flush();
                    if (output != null) output.getFD().sync();
                } finally {
                    writer.close();
                }
            } else if (output != null) {
                output.close();
            }
        } catch (IOException error) {
            recordFailure(error);
        } finally {
            writer = null;
            output = null;
        }
        for (TimestampIndex index : new TimestampIndex[] {accelTimestamps, gyroTimestamps}) {
            if (index == null) continue;
            try {
                index.finishWriting();
            } catch (IOException error) {
                recordFailure(error);
            }
        }
        closed.countDown();
        if (closeRequested) closeIndexes();
        sensorThread.quitSafely();
    }

    @Override
    public void close() {
        closeRequested = true;
        stop();
        if (closed.getCount() == 0) closeIndexes();
    }

    private synchronized void closeIndexes() {
        for (TimestampIndex index : new TimestampIndex[] {accelTimestamps, gyroTimestamps}) {
            if (index == null) continue;
            try {
                index.close();
            } catch (IOException error) {
                recordFailure(error);
            }
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!recording || writer == null) return;
        try {
            String sensorName;
            int sampleIndex;
            if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER) {
                sensorName = "accelerometer";
                sampleIndex = accelTimestamps.add(event.timestamp);
            } else if (event.sensor.getType() == Sensor.TYPE_GYROSCOPE) {
                sensorName = "gyroscope";
                sampleIndex = gyroTimestamps.add(event.timestamp);
            } else {
                return;
            }

            long receiptElapsedNs = SystemClock.elapsedRealtimeNanos();
            long receiptMonotonicNs = System.nanoTime();
            String row = "{\"sensor\":\"" + sensorName
                    + "\",\"sample_index\":" + sampleIndex
                    + ",\"timestamp_ns\":" + event.timestamp
                    + ",\"receipt_elapsed_realtime_ns\":" + receiptElapsedNs
                    + ",\"receipt_monotonic_ns\":" + receiptMonotonicNs
                    + ",\"accuracy\":" + event.accuracy
                    + ",\"x\":" + Float.toString(event.values[0])
                    + ",\"y\":" + Float.toString(event.values[1])
                    + ",\"z\":" + Float.toString(event.values[2]) + "}\n";
            writer.write(row);
            if (++linesSinceFlush >= 400) {
                writer.flush();
                linesSinceFlush = 0;
            }
        } catch (IOException error) {
            recording = false;
            recordFailure(error);
        }
    }

    private synchronized void recordFailure(IOException error) {
        if (writeFailure == null) {
            writeFailure = error;
            Log.e(TAG, "IMU stream failed", error);
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    TimestampIndex accelTimestamps() { return accelTimestamps; }
    TimestampIndex gyroTimestamps() { return gyroTimestamps; }
    IOException writeFailure() { return writeFailure; }
    Sensor accelerometer() { return accelerometer; }
    Sensor gyroscope() { return gyroscope; }
}
