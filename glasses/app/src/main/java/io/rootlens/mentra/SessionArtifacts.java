package io.rootlens.mentra;

import android.hardware.camera2.CameraMetadata;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.os.SystemClock;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.charset.StandardCharsets;
import java.nio.file.StandardCopyOption;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;

final class SessionArtifacts implements java.io.Closeable {
    private static final long CAMERA_PAIR_TOLERANCE_NS = (1_000_000_000L / AppContract.FPS) / 2;
    static final class FrameRecord {
        long frameNumber;
        long captureStartedTimestampNs;
        long sensorTimestampNs;
        long callbackElapsedRealtimeNs;
        long callbackMonotonicNs;
        long exposureTimeNs = -1;
        long frameDurationNs = -1;
        long rollingShutterSkewNs = -1;
        int sensitivityIso = -1;
    }

    static final class VideoSample {
        long ptsNs;
        long sizeBytes;
        int flags;
    }

    private static final class FrameRecords implements java.io.Closeable {
        private final FixedRecordStore records;

        FrameRecords(File file) throws IOException {
            records = new FixedRecordStore(file, 9);
        }

        void add(FrameRecord frame) throws IOException {
            records.append(frame.frameNumber, frame.captureStartedTimestampNs,
                    frame.sensorTimestampNs, frame.callbackElapsedRealtimeNs,
                    frame.callbackMonotonicNs, frame.exposureTimeNs,
                    frame.frameDurationNs, frame.rollingShutterSkewNs, frame.sensitivityIso);
        }

        FrameRecord get(int index) throws IOException {
            FrameRecord frame = new FrameRecord();
            frame.frameNumber = records.get(index, 0);
            frame.captureStartedTimestampNs = records.get(index, 1);
            frame.sensorTimestampNs = records.get(index, 2);
            frame.callbackElapsedRealtimeNs = records.get(index, 3);
            frame.callbackMonotonicNs = records.get(index, 4);
            frame.exposureTimeNs = records.get(index, 5);
            frame.frameDurationNs = records.get(index, 6);
            frame.rollingShutterSkewNs = records.get(index, 7);
            frame.sensitivityIso = (int) records.get(index, 8);
            return frame;
        }

        int size() { return records.size(); }
        void finishWriting() throws IOException { records.finishWriting(); }
        public void close() throws IOException { records.close(); }
    }

    private static final class VideoSamples implements java.io.Closeable {
        private final FixedRecordStore records;

        VideoSamples(File file) throws IOException {
            records = new FixedRecordStore(file, 3);
        }

        void add(VideoSample sample) throws IOException {
            records.append(sample.ptsNs, sample.sizeBytes, sample.flags);
        }

        VideoSample get(int index) throws IOException {
            VideoSample sample = new VideoSample();
            sample.ptsNs = records.get(index, 0);
            sample.sizeBytes = records.get(index, 1);
            sample.flags = (int) records.get(index, 2);
            return sample;
        }

        int size() { return records.size(); }
        void finishWriting() throws IOException { records.finishWriting(); }
        public void close() throws IOException { records.close(); }
    }

    private static final SimpleDateFormat DIRECTORY_FORMAT;
    private static final SimpleDateFormat ISO_FORMAT;

    static {
        DIRECTORY_FORMAT = new SimpleDateFormat("yyyyMMdd'T'HHmmss.SSS'Z'", Locale.US);
        DIRECTORY_FORMAT.setTimeZone(TimeZone.getTimeZone("UTC"));
        ISO_FORMAT = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        ISO_FORMAT.setTimeZone(TimeZone.getTimeZone("UTC"));
    }

    final File directory;
    final File partialVideo;
    final File partialCameraFrames;
    final File partialImu;
    private final File partialFrames;

    private final File video;
    private final File imu;
    private final File frames;
    private final FrameRecords cameraFrames;
    private final BufferedWriter cameraWriter;
    private IOException cameraWriteFailure;
    private int cameraLinesSinceFlush;
    private boolean cancelledDiscarded;

    private SessionArtifacts(File directory) throws IOException {
        this.directory = directory;
        partialVideo = new File(directory, "rgb.mp4.partial");
        partialCameraFrames = new File(directory, "camera_frames.raw.jsonl.partial");
        partialImu = new File(directory, "imu.jsonl.partial");
        partialFrames = new File(directory, "frames.jsonl.partial");
        video = new File(directory, "rgb.mp4");
        imu = new File(directory, "imu.jsonl");
        frames = new File(directory, "frames.jsonl");
        cameraFrames = new FrameRecords(new File(directory, "camera_index.bin"));
        try {
            cameraWriter = new BufferedWriter(new OutputStreamWriter(
                    new FileOutputStream(partialCameraFrames, false), StandardCharsets.UTF_8),
                    1024 * 1024);
        } catch (IOException error) {
            cameraFrames.close();
            throw error;
        }
    }

    static SessionArtifacts create(File recordingsRoot) throws IOException {
        return create(recordingsRoot, "rec-");
    }

    static SessionArtifacts createCalibration(File recordingsRoot) throws IOException {
        return create(recordingsRoot, "calibration-");
    }

    private static SessionArtifacts create(File recordingsRoot, String prefix) throws IOException {
        if (!recordingsRoot.exists() && !recordingsRoot.mkdirs()) {
            throw new IOException("Cannot create recordings directory: " + recordingsRoot);
        }
        File directory = new File(recordingsRoot, prefix + DIRECTORY_FORMAT.format(new Date()));
        if (!directory.mkdirs()) throw new IOException("Cannot create clip directory: " + directory);
        return new SessionArtifacts(directory);
    }

    synchronized void addCameraFrame(FrameRecord frame) throws IOException {
        if (cameraWriteFailure != null) throw cameraWriteFailure;
        try {
            cameraFrames.add(frame);
            cameraWriter.write(new JSONObject()
                    .put("frame_number", frame.frameNumber)
                    .put("capture_started_timestamp_ns", frame.captureStartedTimestampNs)
                    .put("sensor_timestamp_ns", frame.sensorTimestampNs)
                    .put("callback_elapsed_realtime_ns", frame.callbackElapsedRealtimeNs)
                    .put("callback_monotonic_ns", frame.callbackMonotonicNs)
                    .put("exposure_time_ns", nullable(frame.exposureTimeNs))
                    .put("frame_duration_ns", nullable(frame.frameDurationNs))
                    .put("rolling_shutter_skew_ns", nullable(frame.rollingShutterSkewNs))
                    .put("sensitivity_iso", frame.sensitivityIso < 0 ? JSONObject.NULL : frame.sensitivityIso)
                    .toString());
            cameraWriter.newLine();
            if (++cameraLinesSinceFlush >= 120) {
                cameraWriter.flush();
                cameraLinesSinceFlush = 0;
            }
        } catch (IOException | JSONException error) {
            cameraWriteFailure = error instanceof IOException
                    ? (IOException) error : new IOException("Camera JSONL write failed", error);
            throw cameraWriteFailure;
        }
    }

    synchronized File finalizeClip(
            DeviceProbe.Snapshot probe,
            RawImuRecorder rawImu,
            long requestedDurationSeconds,
            int bitrateBps,
            long recorderStartWallMs,
            long recorderStartElapsedNs,
            long recorderStartMonotonicNs,
            long recorderStopWallMs,
            boolean recorderStopSucceeded,
            VideoImuCalibration calibration,
            boolean audioRequired) throws IOException {
        try {
            cameraWriter.flush();
            cameraWriter.close();
        } catch (IOException closeError) {
            if (cameraWriteFailure == null) cameraWriteFailure = closeError;
        }
        if (cameraWriteFailure != null) throw cameraWriteFailure;
        cameraFrames.finishWriting();
        if (rawImu.writeFailure() != null) throw rawImu.writeFailure();
        if (!recorderStopSucceeded) throw new IOException("MediaRecorder did not produce a complete MP4");

        move(partialVideo, video);
        move(partialImu, imu);
        move(partialCameraFrames, new File(directory, "camera_frames.raw.jsonl"));

        ExtractedVideo extracted = extractVideo(video, audioRequired);
        try {
            Alignment alignment = align(cameraFrames, extracted.samples);
            if (alignment.verifiedPairCount == 0) {
                throw new IOException("No Camera2 results can be aligned to MP4 samples");
            }
            Mapping mapping = calculateMapping(
                    cameraFrames,
                    alignment,
                    probe.androidElapsedRealtimeComparable(),
                    probe.json.optBoolean("single_hardware_timestamp_counter_confirmed", false));
            writeFrames(extracted.samples, alignment, mapping, rawImu, calibration);
            move(partialFrames, frames);
            JSONObject syncReport = buildSyncReport(
                    probe, rawImu, extracted, alignment, mapping, calibration);
            writeJson(new File(directory, "sync_report.json"), syncReport);

            JSONObject metadata = new JSONObject();
            try {
                metadata.put("schema", "rootlens.mentra.raw.v1");
                metadata.put("capture_app_version", probe.json.getJSONObject("capture_app_version"));
                metadata.put("created_at", ISO_FORMAT.format(new Date(recorderStartWallMs)));
                metadata.put("stopped_at", ISO_FORMAT.format(new Date(recorderStopWallMs)));
                metadata.put("actual_duration_ms", Math.max(1, recorderStopWallMs - recorderStartWallMs));
                metadata.put("requested_duration_seconds", requestedDurationSeconds);
                metadata.put("recorder_start_elapsed_realtime_ns", recorderStartElapsedNs);
                metadata.put("recorder_start_monotonic_ns", recorderStartMonotonicNs);
                metadata.put("video", extracted.formatJson);
                metadata.put("video_cadence", extracted.cadenceJson);
                metadata.put("video_bytes", video.length());
                metadata.put("audio", extracted.audioFormatJson == null
                        ? JSONObject.NULL : extracted.audioFormatJson);
                metadata.put("audio_sample_count", extracted.audioSampleCount);
                metadata.put("camera_result_count", cameraFrames.size());
                metadata.put("camera_aligned_sample_count", alignment.verifiedPairCount);
                metadata.put("camera_unmatched_sample_count", alignment.sampleCount - alignment.verifiedPairCount);
                metadata.put("accelerometer_sample_count", rawImu.accelTimestamps().size());
                metadata.put("gyroscope_sample_count", rawImu.gyroTimestamps().size());
                JSONObject captureConfiguration = new JSONObject()
                        .put("width", AppContract.WIDTH)
                        .put("height", AppContract.HEIGHT)
                        .put("fps", AppContract.FPS)
                        .put("bitrate_bps", bitrateBps)
                        .put("codec", "video/avc")
                        .put("bit_depth", 8)
                        .put("hdr", false)
                        .put("audio", audioRequired)
                        .put("orientation", "landscape")
                        .put("video_to_imu_offset_ns", calibration.offsetNs)
                        .put("video_to_imu_offset_convention",
                                VideoImuCalibration.CONVENTION)
                        .put("video_to_imu_calibration", CalibrationStore.auditJson(calibration));
                if (audioRequired) {
                    captureConfiguration
                            .put("audio_source", "mic")
                            .put("audio_codec", "audio/mp4a-latm")
                            .put("audio_sample_rate_hz", AppContract.AUDIO_SAMPLE_RATE_HZ)
                            .put("audio_channels", AppContract.AUDIO_CHANNELS)
                            .put("audio_bitrate_bps", AppContract.AUDIO_BITRATE_BPS);
                }
                metadata.put("capture_configuration", captureConfiguration);
                metadata.put("device_probe", deliveryDeviceMetadata(probe.json));
                metadata.put("files", new JSONArray()
                        .put("rgb.mp4")
                        .put("frames.jsonl")
                        .put("imu.jsonl")
                        .put("metadata.json"));
            } catch (JSONException error) {
                throw new IOException("Metadata construction failed", error);
            }
            extracted.samples.close();
            cameraFrames.close();
            CaptureFileCommit.publish(directory,
                    new String[] {"rgb.mp4", "imu.jsonl", "frames.jsonl", "camera_frames.raw.jsonl"},
                    (partialMetadata, directorySyncSupported) -> {
                        try {
                            metadata.put("directory_fsync_supported", directorySyncSupported);
                        } catch (JSONException error) {
                            throw new IOException("Storage durability metadata construction failed", error);
                        }
                        writeJson(partialMetadata, metadata);
                    }, new CaptureFileCommit.Sync() {
                        public void file(File file) throws IOException { CaptureFileCommit.syncFile(file); }
                        public boolean directory(File file) throws IOException { return syncDirectory(file); }
                    });
            return directory;
        } finally {
            extracted.samples.close();
        }
    }

    private static JSONObject deliveryDeviceMetadata(JSONObject probe) throws JSONException {
        return new JSONObject()
                .put("device_manufacturer", probe.opt("device_manufacturer"))
                .put("device_model", probe.opt("device_model"))
                .put("android_release", probe.opt("android_release"))
                .put("android_sdk", probe.opt("android_sdk"));
    }

    synchronized void failClip(Throwable error) {
        Throwable cause = error == null ? new IOException("Unknown capture failure") : error;
        try {
            close();
        } catch (IOException ignored) {
        }
        try {
            JSONObject failure = new JSONObject()
                    .put("status", "failed")
                    .put("error_type", cause.getClass().getName())
                    .put("message", cause.getMessage() == null ? cause.toString() : cause.getMessage())
                    .put("failed_at_elapsed_realtime_ns", SystemClock.elapsedRealtimeNanos());
            writeJson(new File(directory, "failure.json"), failure);
        } catch (IOException | JSONException ignored) {
        }
    }

    @Override
    public synchronized void close() throws IOException {
        try {
            cameraWriter.close();
        } finally {
            cameraFrames.close();
        }
    }

    /** Only the engine's never-started, newly created session may call this after closing IMU. */
    synchronized void discardCancelled() throws IOException {
        if (cancelledDiscarded) return;
        close();
        if (cameraFrames.size() != 0) throw new IOException("Cannot discard a session with camera frames");
        if (Files.isSymbolicLink(directory.toPath()) || !directory.isDirectory()) {
            throw new IOException("Cancelled session directory is unavailable");
        }
        Set<String> allowed = new HashSet<>(Arrays.asList(
                "rgb.mp4.partial", "camera_frames.raw.jsonl.partial", "imu.jsonl.partial",
                "camera_index.bin", "video_index.bin", "accelerometer_index.bin", "gyroscope_index.bin"));
        File[] children = directory.listFiles();
        if (children == null) throw new IOException("Cannot inspect cancelled session directory");
        for (File file : children) {
            if (!allowed.contains(file.getName())
                    || !Files.isRegularFile(file.toPath(), LinkOption.NOFOLLOW_LINKS)) {
                throw new IOException("Cancelled session contains an unexpected artifact: " + file.getName());
            }
        }
        for (File file : children) Files.delete(file.toPath());
        Files.delete(directory.toPath());
        cancelledDiscarded = true;
    }

    void discardScratchIndexes() {
        for (String name : new String[] {"camera_index.bin", "video_index.bin",
                "accelerometer_index.bin", "gyroscope_index.bin"}) {
            try {
                Files.deleteIfExists(new File(directory, name).toPath());
            } catch (IOException error) {
                Log.w("RootLensArtifacts", "Could not remove finalized scratch index " + name, error);
            }
        }
    }

    private void writeFrames(
            VideoSamples samples,
            Alignment alignment,
            Mapping mapping,
            RawImuRecorder rawImu,
            VideoImuCalibration calibration) throws IOException {
        FrameRecord anchorFrame = cameraFrames.get(alignment.cameraStart);
        VideoSample anchorSample = samples.get(alignment.sampleStart);
        try (BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(
                new FileOutputStream(partialFrames, false), StandardCharsets.UTF_8), 1024 * 1024)) {
            for (int sampleIndex = 0; sampleIndex < samples.size(); sampleIndex++) {
                VideoSample sample = samples.get(sampleIndex);
                int pairedOffset = sampleIndex - alignment.sampleStart;
                int candidateIndex = pairedOffset >= 0 && pairedOffset < alignment.pairedCount
                        ? alignment.cameraStart + pairedOffset : -1;
                FrameRecord frame = candidateIndex >= 0 ? cameraFrames.get(candidateIndex) : null;
                if (frame != null && !timestampsAgree(frame.sensorTimestampNs, sample.ptsNs,
                        anchorFrame.sensorTimestampNs, anchorSample.ptsNs)) frame = null;
                boolean hasCameraResult = frame != null;
                int cameraIndex = hasCameraResult ? candidateIndex : -1;
                long videoTimestampInCameraDomainNs = frame == null
                        ? anchorFrame.sensorTimestampNs + (sample.ptsNs - anchorSample.ptsNs)
                        : frame.sensorTimestampNs;
                long mappedElapsedNs = videoTimestampInCameraDomainNs + mapping.cameraToElapsedOffsetNs;
                long imuAssociationTimestampNs = mappedElapsedNs + calibration.offsetNs;
                int accelBefore = rawImu.accelTimestamps().floorIndex(imuAssociationTimestampNs);
                int gyroBefore = rawImu.gyroTimestamps().floorIndex(imuAssociationTimestampNs);
                JSONObject row = new JSONObject();
                try {
                    row.put("frame_index", sampleIndex);
                    row.put("mp4_sample_index", sampleIndex);
                    row.put("mp4_pts_ns", sample.ptsNs);
                    row.put("mp4_sample_size_bytes", sample.sizeBytes);
                    row.put("mp4_key_frame", (sample.flags & MediaExtractor.SAMPLE_FLAG_SYNC) != 0);
                    row.put("video_frame_timestamp_elapsed_realtime_ns", mappedElapsedNs);
                    row.put("video_frame_timestamp_source", hasCameraResult
                            ? "camera_capture_result"
                            : "mp4_pts_interpolated_from_camera_timeline");
                    row.put("camera_result_present", hasCameraResult);
                    row.put("camera_result_index", hasCameraResult ? cameraIndex : JSONObject.NULL);
                    row.put("camera_frame_number", hasCameraResult ? frame.frameNumber : JSONObject.NULL);
                    row.put("camera_sensor_timestamp_ns", hasCameraResult
                            ? frame.sensorTimestampNs : JSONObject.NULL);
                    row.put("camera_capture_started_timestamp_ns", hasCameraResult
                            ? frame.captureStartedTimestampNs : JSONObject.NULL);
                    row.put("camera_callback_elapsed_realtime_ns", hasCameraResult
                            ? frame.callbackElapsedRealtimeNs : JSONObject.NULL);
                    row.put("camera_callback_monotonic_ns", hasCameraResult
                            ? frame.callbackMonotonicNs : JSONObject.NULL);
                    row.put("camera_timestamp_mapped_elapsed_realtime_ns", mappedElapsedNs);
                    row.put("camera_to_elapsed_offset_ns", mapping.cameraToElapsedOffsetNs);
                    row.put("video_to_imu_offset_ns", calibration.offsetNs);
                    row.put("video_to_imu_offset_convention",
                            VideoImuCalibration.CONVENTION);
                    row.put("video_to_imu_calibration_id", calibration.calibrationId);
                    row.put("imu_association_timestamp_ns", imuAssociationTimestampNs);
                    row.put("mapping_quality", mapping.quality);
                    row.put("exposure_time_ns", hasCameraResult
                            ? nullable(frame.exposureTimeNs) : JSONObject.NULL);
                    row.put("frame_duration_ns", hasCameraResult
                            ? nullable(frame.frameDurationNs) : JSONObject.NULL);
                    row.put("rolling_shutter_skew_ns", hasCameraResult
                            ? nullable(frame.rollingShutterSkewNs) : JSONObject.NULL);
                    row.put("sensitivity_iso", hasCameraResult && frame.sensitivityIso >= 0
                            ? frame.sensitivityIso : JSONObject.NULL);
                    putNeighbors(row, "accelerometer", rawImu.accelTimestamps(), accelBefore);
                    putNeighbors(row, "gyroscope", rawImu.gyroTimestamps(), gyroBefore);
                    writer.write(row.toString());
                    writer.newLine();
                } catch (JSONException error) {
                    throw new IOException("Frame JSON construction failed", error);
                }
            }
        }
    }

    private static void putNeighbors(
            JSONObject row, String prefix, TimestampIndex timestamps, int before) throws JSONException, IOException {
        int after = before + 1 < timestamps.size() ? before + 1 : -1;
        row.put(prefix + "_before_index", before < 0 ? JSONObject.NULL : before);
        row.put(prefix + "_before_timestamp_ns", before < 0 ? JSONObject.NULL : timestamps.get(before));
        row.put(prefix + "_after_index", after < 0 ? JSONObject.NULL : after);
        row.put(prefix + "_after_timestamp_ns", after < 0 ? JSONObject.NULL : timestamps.get(after));
    }

    private static JSONObject buildSyncReport(
            DeviceProbe.Snapshot probe,
            RawImuRecorder rawImu,
            ExtractedVideo video,
            Alignment alignment,
            Mapping mapping,
            VideoImuCalibration calibration) throws IOException {
        try {
            JSONObject clockAudit = probe.json.optJSONObject("clock_architecture_audit");
            boolean commonTimestampCounterConfirmed = clockAudit != null
                    && clockAudit.optBoolean("single_hardware_timestamp_counter_confirmed", false);
            return new JSONObject()
                    .put("schema", "rootlens.mentra.sync.v1")
                    .put("camera_hal_timestamp_source", probe.timestampSourceName())
                    .put("shared_android_elapsed_realtime_timebase_guaranteed",
                            probe.androidElapsedRealtimeComparable())
                    .put("single_physical_clock_source_guaranteed", false)
                    .put("single_hardware_timestamp_counter_confirmed",
                            commonTimestampCounterConfirmed)
                    .put("single_physical_clock_source_evidence",
                            commonTimestampCounterConfirmed
                                    ? "kernel paths share the ARM architectural counter, but the sensor sampling clocks are distinct"
                                    : "not confirmed for this firmware build")
                    .put("hardware_sync_guaranteed", false)
                    .put("physical_capture_trigger_sync_guaranteed", false)
                    .put("sample_event_hardware_latched_to_common_counter", false)
                    .put("claru_single_hardware_clock_requirement_status",
                            commonTimestampCounterConfirmed
                                    ? "common_timestamp_counter_confirmed_samples_not_hardware_latched"
                                    : "not_confirmed")
                    .put("clock_architecture_audit", clockAudit == null ? JSONObject.NULL : clockAudit)
                    .put("camera_to_imu_mapping", new JSONObject()
                            .put("method", mapping.method)
                            .put("quality", mapping.quality)
                            .put("camera_to_elapsed_realtime_offset_ns", mapping.cameraToElapsedOffsetNs)
                            .put("clock_bridge_stddev_ns", mapping.clockBridgeStddevNs)
                            .put("callback_minus_mapped_camera_min_ns", mapping.minimumDeliveryLatencyNs)
                            .put("callback_minus_mapped_camera_p50_ns", mapping.medianDeliveryLatencyNs)
                            .put("callback_minus_mapped_camera_stddev_ns", mapping.deliveryLatencyStddevNs))
                    .put("video_alignment", new JSONObject()
                            .put("camera_result_count", alignment.cameraCount)
                            .put("mp4_sample_count", alignment.sampleCount)
                            .put("paired_count", alignment.verifiedPairCount)
                            .put("timestamp_mismatch_count", alignment.pairedCount - alignment.verifiedPairCount)
                            .put("camera_pair_tolerance_ns", CAMERA_PAIR_TOLERANCE_NS)
                            .put("camera_start_index", alignment.cameraStart)
                            .put("mp4_start_index", alignment.sampleStart)
                            .put("unpaired_camera_results", alignment.cameraCount - alignment.verifiedPairCount)
                            .put("unpaired_mp4_samples", alignment.sampleCount - alignment.verifiedPairCount)
                            .put("per_frame_video_imu_timestamp_count", alignment.sampleCount)
                            .put("interpolated_video_frame_timestamp_count",
                                    alignment.sampleCount - alignment.verifiedPairCount)
                            .put("relative_timeline_mean_absolute_error_ns", alignment.meanAbsoluteTimelineErrorNs))
                    .put("accelerometer_sample_count", rawImu.accelTimestamps().size())
                    .put("gyroscope_sample_count", rawImu.gyroTimestamps().size())
                    .put("video_format", video.formatJson)
                    .put("video_cadence", video.cadenceJson)
                    .put("motion_based_video_gyro_validation", new JSONObject()
                            .put("offset_ns", calibration.offsetNs)
                            .put("convention", VideoImuCalibration.CONVENTION)
                            .put("calibration", CalibrationStore.auditJson(calibration)))
                    .put("claim_gate", commonTimestampCounterConfirmed
                            ? "The audited firmware uses one ARM hardware counter for camera and IMU timestamps. "
                                    + "Do not claim hardware-synchronized acquisition: IMU samples are software-timestamped "
                                    + "in the polling path and require measured video-to-gyro offset and jitter"
                            : "Do not claim a common hardware timestamp counter on this firmware without a matching audit");
        } catch (JSONException error) {
            throw new IOException("Sync report construction failed", error);
        }
    }

    private static Mapping calculateMapping(
            FrameRecords frames,
            Alignment alignment,
            boolean halRealtimeGuaranteed,
            boolean commonTimestampCounterConfirmed) throws IOException {
        if (alignment.pairedCount == 0) {
            return new Mapping(0, 0, 0, 0, 0, "unavailable", "no_frames");
        }
        long[] directDeliveryLatency = new long[alignment.pairedCount];
        long[] clockBridgeOffsets = new long[alignment.pairedCount];
        int plausibleMonotonicCount = 0;
        for (int index = 0; index < alignment.pairedCount; index++) {
            FrameRecord frame = frames.get(alignment.cameraStart + index);
            long monotonicDeliveryNs = frame.callbackMonotonicNs - frame.sensorTimestampNs;
            directDeliveryLatency[index] = halRealtimeGuaranteed
                    ? frame.callbackElapsedRealtimeNs - frame.sensorTimestampNs
                    : monotonicDeliveryNs;
            clockBridgeOffsets[index] = frame.callbackElapsedRealtimeNs - frame.callbackMonotonicNs;
            if (monotonicDeliveryNs >= -5_000_000L && monotonicDeliveryNs <= 2_000_000_000L) {
                plausibleMonotonicCount++;
            }
        }
        Arrays.sort(directDeliveryLatency);
        Arrays.sort(clockBridgeOffsets);
        if (halRealtimeGuaranteed) {
            return new Mapping(
                    0,
                    directDeliveryLatency[0],
                    median(directDeliveryLatency),
                    standardDeviation(directDeliveryLatency),
                    standardDeviation(clockBridgeOffsets),
                    "direct: camera HAL REALTIME equals Android elapsedRealtime timebase",
                    "hal_realtime_guaranteed");
        }
        if (plausibleMonotonicCount >= Math.ceil(alignment.pairedCount * 0.99)) {
            return new Mapping(
                    median(clockBridgeOffsets),
                    directDeliveryLatency[0],
                    median(directDeliveryLatency),
                    standardDeviation(directDeliveryLatency),
                    standardDeviation(clockBridgeOffsets),
                    commonTimestampCounterConfirmed
                            ? "firmware-audited common ARM counter; fixed BOOTTIME-minus-MONOTONIC "
                                    + "suspend offset measured concurrently"
                            : "empirical camera timestamp approximately CLOCK_MONOTONIC; bridged with concurrent "
                                    + "elapsedRealtimeNanos-System.nanoTime samples",
                    commonTimestampCounterConfirmed
                            ? "firmware_audited_common_counter_hal_contract_unknown"
                            : "empirical_monotonic_domain_mapping_not_hal_guaranteed");
        }

        long[] callbackMinusCamera = new long[alignment.pairedCount];
        for (int index = 0; index < alignment.pairedCount; index++) {
            FrameRecord frame = frames.get(alignment.cameraStart + index);
            callbackMinusCamera[index] = frame.callbackElapsedRealtimeNs - frame.sensorTimestampNs;
        }
        Arrays.sort(callbackMinusCamera);
        int percentileOne = Math.min(callbackMinusCamera.length - 1,
                Math.max(0, (int) Math.floor(callbackMinusCamera.length * 0.01)));
        long offset = callbackMinusCamera[percentileOne];
        long[] estimatedDelivery = new long[callbackMinusCamera.length];
        for (int index = 0; index < callbackMinusCamera.length; index++) {
            estimatedDelivery[index] = callbackMinusCamera[index] - offset;
        }
        return new Mapping(
                offset,
                estimatedDelivery[0],
                median(estimatedDelivery),
                standardDeviation(estimatedDelivery),
                standardDeviation(clockBridgeOffsets),
                "lower-envelope(callback_elapsed_realtime_ns-camera_sensor_timestamp_ns)",
                "statistical_only_hal_timestamp_source_unknown_or_unverified");
    }

    private static long median(long[] sortedValues) {
        return sortedValues[sortedValues.length / 2];
    }

    private static long standardDeviation(long[] values) {
        double mean = 0;
        for (long value : values) mean += value;
        mean /= values.length;
        double sumSquares = 0;
        for (long value : values) {
            double delta = value - mean;
            sumSquares += delta * delta;
        }
        return Math.round(Math.sqrt(sumSquares / values.length));
    }

    private static Alignment align(FrameRecords frames, VideoSamples samples) throws IOException {
        int cameraCount = frames.size();
        int sampleCount = samples.size();
        int paired = Math.min(cameraCount, sampleCount);
        if (paired == 0) return new Alignment(cameraCount, sampleCount, 0, 0, 0, 0, -1);

        int bestCameraStart = 0;
        int bestSampleStart = 0;
        double bestError = Double.MAX_VALUE;
        int maxCameraStart = Math.min(cameraCount - paired, 180);
        int maxSampleStart = Math.min(sampleCount - paired, 180);
        for (int cameraStart = 0; cameraStart <= maxCameraStart; cameraStart++) {
            for (int sampleStart = 0; sampleStart <= maxSampleStart; sampleStart++) {
                double error = timelineError(frames, samples, cameraStart, sampleStart, paired);
                if (error < bestError) {
                    bestError = error;
                    bestCameraStart = cameraStart;
                    bestSampleStart = sampleStart;
                }
            }
        }
        long cameraOrigin = frames.get(bestCameraStart).sensorTimestampNs;
        long sampleOrigin = samples.get(bestSampleStart).ptsNs;
        int verifiedPairs = 0;
        for (int index = 0; index < paired; index++) {
            if (timestampsAgree(frames.get(bestCameraStart + index).sensorTimestampNs,
                    samples.get(bestSampleStart + index).ptsNs, cameraOrigin, sampleOrigin)) verifiedPairs++;
        }
        return new Alignment(cameraCount, sampleCount, paired, verifiedPairs, bestCameraStart, bestSampleStart,
                Math.round(bestError));
    }

    private static boolean timestampsAgree(long cameraNs, long sampleNs, long cameraOrigin, long sampleOrigin) {
        return Math.abs((cameraNs - cameraOrigin) - (sampleNs - sampleOrigin)) < CAMERA_PAIR_TOLERANCE_NS;
    }

    private static double timelineError(
            FrameRecords frames,
            VideoSamples samples,
            int cameraStart,
            int sampleStart,
            int paired) throws IOException {
        long cameraOrigin = frames.get(cameraStart).sensorTimestampNs;
        long sampleOrigin = samples.get(sampleStart).ptsNs;
        int evaluated = Math.min(paired, 600);
        double total = 0;
        for (int point = 0; point < evaluated; point++) {
            int index = evaluated == 1 ? 0 : (int) (((long) point * (paired - 1)) / (evaluated - 1));
            long cameraRelative = frames.get(cameraStart + index).sensorTimestampNs - cameraOrigin;
            long sampleRelative = samples.get(sampleStart + index).ptsNs - sampleOrigin;
            total += Math.abs(cameraRelative - sampleRelative);
        }
        return total / evaluated;
    }

    private static ExtractedVideo extractVideo(File video, boolean audioRequired) throws IOException {
        MediaExtractor extractor = new MediaExtractor();
        VideoSamples samples = new VideoSamples(new File(video.getParentFile(), "video_index.bin"));
        boolean completed = false;
        try {
            extractor.setDataSource(video.getAbsolutePath());
            int videoTrack = -1;
            int audioTrack = -1;
            MediaFormat format = null;
            MediaFormat audioFormat = null;
            for (int track = 0; track < extractor.getTrackCount(); track++) {
                MediaFormat candidate = extractor.getTrackFormat(track);
                String mime = candidate.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("video/") && videoTrack < 0) {
                    videoTrack = track;
                    format = candidate;
                } else if (mime != null && mime.startsWith("audio/") && audioTrack < 0) {
                    audioTrack = track;
                    audioFormat = candidate;
                }
            }
            if (videoTrack < 0 || format == null) throw new IOException("MP4 has no video track");
            if (audioRequired && (audioTrack < 0 || audioFormat == null)) {
                throw new IOException("MP4 has no audio track");
            }
            int width = format.getInteger(MediaFormat.KEY_WIDTH);
            int height = format.getInteger(MediaFormat.KEY_HEIGHT);
            String mime = format.getString(MediaFormat.KEY_MIME);
            if (width != AppContract.WIDTH || height != AppContract.HEIGHT) {
                throw new IOException("Recorded dimensions are " + width + "x" + height + ", expected 1920x1080");
            }
            if (!MediaFormat.MIMETYPE_VIDEO_AVC.equals(mime)) {
                throw new IOException("Recorded codec is " + mime + ", expected video/avc");
            }

            JSONObject formatJson = new JSONObject();
            try {
                formatJson.put("mime", mime).put("width", width).put("height", height);
                formatJson.put("bit_depth", 8).put("hdr", false);
                copyInteger(format, formatJson, MediaFormat.KEY_FRAME_RATE, "frame_rate");
                copyInteger(format, formatJson, MediaFormat.KEY_BIT_RATE, "bitrate_bps");
                copyInteger(format, formatJson, MediaFormat.KEY_PROFILE, "codec_profile");
                copyInteger(format, formatJson, MediaFormat.KEY_LEVEL, "codec_level");
                copyInteger(format, formatJson, MediaFormat.KEY_COLOR_STANDARD, "color_standard");
                copyInteger(format, formatJson, MediaFormat.KEY_COLOR_TRANSFER, "color_transfer");
                copyInteger(format, formatJson, MediaFormat.KEY_COLOR_RANGE, "color_range");
                if (format.containsKey(MediaFormat.KEY_COLOR_STANDARD)
                        && format.getInteger(MediaFormat.KEY_COLOR_STANDARD)
                        == MediaFormat.COLOR_STANDARD_BT709) {
                    formatJson.put("color_standard_name", "BT709");
                }
                if (format.containsKey(MediaFormat.KEY_COLOR_TRANSFER)
                        && format.getInteger(MediaFormat.KEY_COLOR_TRANSFER)
                        == MediaFormat.COLOR_TRANSFER_SDR_VIDEO) {
                    formatJson.put("color_transfer_name", "SDR_VIDEO");
                }
                if (format.containsKey(MediaFormat.KEY_COLOR_RANGE)
                        && format.getInteger(MediaFormat.KEY_COLOR_RANGE)
                        == MediaFormat.COLOR_RANGE_LIMITED) {
                    formatJson.put("color_range_name", "LIMITED");
                }
            } catch (JSONException error) {
                throw new IOException("Video format JSON failed", error);
            }

            extractor.selectTrack(videoTrack);
            while (extractor.getSampleTrackIndex() >= 0) {
                VideoSample sample = new VideoSample();
                sample.ptsNs = extractor.getSampleTime() * 1000L;
                sample.sizeBytes = extractor.getSampleSize();
                sample.flags = extractor.getSampleFlags();
                samples.add(sample);
                if (!extractor.advance()) break;
            }
            if (samples.size() == 0) throw new IOException("MP4 video track has no samples");
            samples.finishWriting();

            if (!audioRequired) {
                ExtractedVideo result = new ExtractedVideo(
                        samples, formatJson, cadenceJson(samples), null, 0);
                completed = true;
                return result;
            }

            String audioMime = audioFormat.getString(MediaFormat.KEY_MIME);
            if (!MediaFormat.MIMETYPE_AUDIO_AAC.equals(audioMime)) {
                throw new IOException("Recorded audio codec is " + audioMime
                        + ", expected audio/mp4a-latm");
            }

            extractor.unselectTrack(videoTrack);
            extractor.selectTrack(audioTrack);
            extractor.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC);
            int audioSampleCount = 0;
            long firstAudioPtsUs = -1L;
            long lastAudioPtsUs = -1L;
            while (extractor.getSampleTrackIndex() >= 0) {
                long ptsUs = extractor.getSampleTime();
                if (firstAudioPtsUs < 0) firstAudioPtsUs = ptsUs;
                lastAudioPtsUs = ptsUs;
                audioSampleCount++;
                if (!extractor.advance()) break;
            }
            int sampleRateHz = requiredInteger(
                    audioFormat, MediaFormat.KEY_SAMPLE_RATE, "audio sample rate");
            int channelCount = requiredInteger(
                    audioFormat, MediaFormat.KEY_CHANNEL_COUNT, "audio channel count");
            long firstVideoPtsUs = samples.get(0).ptsNs / 1_000L;
            long lastVideoPtsUs = samples.get(samples.size() - 1).ptsNs / 1_000L;
            AudioTrackContract.validate(
                    sampleRateHz,
                    channelCount,
                    audioSampleCount,
                    firstAudioPtsUs,
                    lastAudioPtsUs,
                    firstVideoPtsUs,
                    lastVideoPtsUs);

            JSONObject audioFormatJson = new JSONObject();
            try {
                audioFormatJson.put("mime", audioMime);
                copyInteger(audioFormat, audioFormatJson, MediaFormat.KEY_SAMPLE_RATE,
                        "sample_rate_hz");
                copyInteger(audioFormat, audioFormatJson, MediaFormat.KEY_CHANNEL_COUNT,
                        "channel_count");
                copyInteger(audioFormat, audioFormatJson, MediaFormat.KEY_BIT_RATE,
                        "bitrate_bps");
                copyInteger(audioFormat, audioFormatJson, MediaFormat.KEY_AAC_PROFILE,
                        "aac_profile");
                audioFormatJson.put("sample_count", audioSampleCount);
                audioFormatJson.put("pts_span_us", Math.max(0L, lastAudioPtsUs - firstAudioPtsUs));
            } catch (JSONException error) {
                throw new IOException("Audio format JSON failed", error);
            }
            ExtractedVideo result = new ExtractedVideo(
                    samples, formatJson, cadenceJson(samples), audioFormatJson, audioSampleCount);
            completed = true;
            return result;
        } finally {
            extractor.release();
            if (!completed) samples.close();
        }
    }

    private static void copyInteger(
            MediaFormat source, JSONObject destination, String sourceKey, String destinationKey) throws JSONException {
        if (source.containsKey(sourceKey)) destination.put(destinationKey, source.getInteger(sourceKey));
    }

    private static int requiredInteger(MediaFormat source, String key, String label) throws IOException {
        if (!source.containsKey(key)) throw new IOException("MP4 is missing " + label);
        return source.getInteger(key);
    }

    private static JSONObject cadenceJson(VideoSamples samples) throws IOException {
        try {
            JSONObject result = new JSONObject()
                    .put("nominal_fps", AppContract.FPS)
                    .put("sample_count", samples.size());
            if (samples.size() < 2) return result.put("status", "insufficient_samples");
            long targetIntervalNs = 1_000_000_000L / AppContract.FPS;
            long minimumNs = Long.MAX_VALUE;
            long maximumNs = Long.MIN_VALUE;
            double sum = 0;
            double sumSquares = 0;
            int largeOutlierCount = 0;
            for (int index = 1; index < samples.size(); index++) {
                long intervalNs = samples.get(index).ptsNs - samples.get(index - 1).ptsNs;
                minimumNs = Math.min(minimumNs, intervalNs);
                maximumNs = Math.max(maximumNs, intervalNs);
                sum += intervalNs;
                sumSquares += (double) intervalNs * intervalNs;
                if (Math.abs(intervalNs - targetIntervalNs) > targetIntervalNs * 0.20) {
                    largeOutlierCount++;
                }
            }
            int intervalCount = samples.size() - 1;
            double meanNs = sum / intervalCount;
            double variance = Math.max(0, sumSquares / intervalCount - meanNs * meanNs);
            double observedFps = 1_000_000_000.0 / meanNs;
            return result
                    .put("status", "measured_from_mp4_pts")
                    .put("interval_count", intervalCount)
                    .put("pts_span_ns", samples.get(samples.size() - 1).ptsNs - samples.get(0).ptsNs)
                    .put("mean_interval_ns", Math.round(meanNs))
                    .put("interval_stddev_ns", Math.round(Math.sqrt(variance)))
                    .put("minimum_interval_ns", minimumNs)
                    .put("maximum_interval_ns", maximumNs)
                    .put("observed_average_fps", observedFps)
                    .put("observed_average_fps_within_one_percent",
                            Math.abs(observedFps - AppContract.FPS) <= AppContract.FPS * 0.01)
                    .put("interval_outside_twenty_percent_count", largeOutlierCount);
        } catch (JSONException error) {
            throw new IOException("Video cadence JSON failed", error);
        }
    }

    private static void move(File source, File destination) throws IOException {
        if (!source.isFile()) throw new IOException("Missing capture artifact: " + source);
        Files.move(source.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING);
    }

    static void writeJson(File file, JSONObject json) throws IOException {
        try {
            writeText(file, json.toString(2) + "\n");
        } catch (JSONException error) {
            throw new IOException("JSON serialization failed", error);
        }
    }

    static void writeText(File file, String value) throws IOException {
        File parent = file.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
            throw new IOException("Cannot create parent directory: " + parent);
        }
        FileOutputStream output = new FileOutputStream(file, false);
        try (BufferedWriter writer = new BufferedWriter(new OutputStreamWriter(
                output, StandardCharsets.UTF_8))) {
            writer.write(value);
            writer.flush();
            output.getFD().sync();
        }
    }

    private static boolean syncDirectory(File directory) throws IOException {
        FileDescriptor descriptor;
        try {
            descriptor = Os.open(directory.getAbsolutePath(), OsConstants.O_RDONLY, 0);
        } catch (ErrnoException error) {
            throw new IOException("Cannot open capture directory for sync", error);
        }
        try {
            try {
                Os.fsync(descriptor);
                return true;
            } catch (ErrnoException error) {
                if (error.errno == OsConstants.EINVAL || error.errno == OsConstants.ENOTSUP
                        || error.errno == OsConstants.ENOSYS) {
                    Log.w("RootLensArtifacts", "Recording filesystem does not support directory fsync", error);
                    return false;
                }
                throw new IOException("Capture directory sync failed", error);
            }
        } finally {
            try {
                Os.close(descriptor);
            } catch (ErrnoException error) {
                throw new IOException("Cannot close capture directory after sync", error);
            }
        }
    }

    private static Object nullable(long value) {
        return value < 0 ? JSONObject.NULL : value;
    }

    private static final class ExtractedVideo {
        final VideoSamples samples;
        final JSONObject formatJson;
        final JSONObject cadenceJson;
        final JSONObject audioFormatJson;
        final int audioSampleCount;

        ExtractedVideo(
                VideoSamples samples,
                JSONObject formatJson,
                JSONObject cadenceJson,
                JSONObject audioFormatJson,
                int audioSampleCount) {
            this.samples = samples;
            this.formatJson = formatJson;
            this.cadenceJson = cadenceJson;
            this.audioFormatJson = audioFormatJson;
            this.audioSampleCount = audioSampleCount;
        }
    }

    private static final class Alignment {
        final int cameraCount;
        final int sampleCount;
        final int pairedCount;
        final int verifiedPairCount;
        final int cameraStart;
        final int sampleStart;
        final long meanAbsoluteTimelineErrorNs;

        Alignment(int cameraCount, int sampleCount, int pairedCount, int verifiedPairCount,
                  int cameraStart, int sampleStart,
                  long meanAbsoluteTimelineErrorNs) {
            this.cameraCount = cameraCount;
            this.sampleCount = sampleCount;
            this.pairedCount = pairedCount;
            this.verifiedPairCount = verifiedPairCount;
            this.cameraStart = cameraStart;
            this.sampleStart = sampleStart;
            this.meanAbsoluteTimelineErrorNs = meanAbsoluteTimelineErrorNs;
        }
    }

    private static final class Mapping {
        final long cameraToElapsedOffsetNs;
        final long minimumDeliveryLatencyNs;
        final long medianDeliveryLatencyNs;
        final long deliveryLatencyStddevNs;
        final long clockBridgeStddevNs;
        final String method;
        final String quality;

        Mapping(long cameraToElapsedOffsetNs, long minimumDeliveryLatencyNs, long medianDeliveryLatencyNs,
                long deliveryLatencyStddevNs, long clockBridgeStddevNs, String method, String quality) {
            this.cameraToElapsedOffsetNs = cameraToElapsedOffsetNs;
            this.minimumDeliveryLatencyNs = minimumDeliveryLatencyNs;
            this.medianDeliveryLatencyNs = medianDeliveryLatencyNs;
            this.deliveryLatencyStddevNs = deliveryLatencyStddevNs;
            this.clockBridgeStddevNs = clockBridgeStddevNs;
            this.method = method;
            this.quality = quality;
        }
    }
}
