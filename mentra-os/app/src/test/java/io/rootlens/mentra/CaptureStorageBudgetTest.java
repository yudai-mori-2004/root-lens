package io.rootlens.mentra;

public final class CaptureStorageBudgetTest {
    public static void main(String[] args) {
        long lastReserve = 0L;
        for (int seconds = 0; seconds <= AppContract.MAX_SESSION_SECONDS; seconds += 5) {
            long reserve = CaptureStorageBudget.finalizationReserveBytes(seconds * 1_000L);
            long frameBytes = (long) seconds * AppContract.FPS
                    * CaptureStorageBudget.FRAME_ROW_RESERVE_BYTES;
            check(reserve >= frameBytes + CaptureStorageBudget.FIXED_RESERVE_BYTES,
                    "Finalization must fit even at the five-hour limit");
            check(reserve >= lastReserve, "Reserve must grow with the captured duration");
            lastReserve = reserve;
        }
        check(lastReserve > 2L * 1024L * 1024L * 1024L,
                "Five-hour frame sidecar cannot use only the fixed 512 MiB reserve");
        long lowBitrate = CaptureStorageBudget.preflightBytes(1800, 2_000_000);
        long finalization = CaptureStorageBudget.finalizationReserveBytes(1_800_000L);
        check(lowBitrate > 1800L * 2_000_000L / 8L + finalization + 1800L * 200_000L,
                "Raw IMU/camera storage must be reserved independently of video bitrate");
        check(CaptureStorageBudget.preflightBytes(1800, 12_000_000) > lowBitrate,
                "Higher bitrate must reserve more space");
        System.out.println("Capture storage budget tests passed");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
