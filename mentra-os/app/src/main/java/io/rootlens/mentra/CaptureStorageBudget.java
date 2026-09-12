package io.rootlens.mentra;

/** Space kept for both recording streams and the frame sidecar produced at stop. */
final class CaptureStorageBudget {
    static final long FIXED_RESERVE_BYTES = 512L * 1024L * 1024L;
    // One frame row contains timestamps, sensor neighbors, exposure data and calibration identity.
    static final long FRAME_ROW_RESERVE_BYTES = 4096L;
    static final long STOP_MARGIN_MS = 10_000L;
    // Raw sensor/camera JSONL and temporary binary indexes are independent of video bitrate.
    private static final long LIVE_SIDECAR_BYTES_PER_SECOND = 256L * 1024L;

    static long finalizationReserveBytes(long recordedElapsedMs) {
        long durationMs = Math.max(0L, recordedElapsedMs) + STOP_MARGIN_MS;
        long estimatedFrames = (durationMs * AppContract.FPS + 999L) / 1_000L;
        return FIXED_RESERVE_BYTES + estimatedFrames * FRAME_ROW_RESERVE_BYTES;
    }

    static long preflightBytes(int durationSeconds, int videoBitrateBps) {
        long seconds = Math.max(1, durationSeconds);
        long streamBytes = (long) Math.ceil(seconds
                * ((videoBitrateBps + AppContract.AUDIO_BITRATE_BPS) / 8.0) * 1.20)
                + seconds * LIVE_SIDECAR_BYTES_PER_SECOND;
        return streamBytes + finalizationReserveBytes(seconds * 1_000L);
    }

    private CaptureStorageBudget() {}
}
