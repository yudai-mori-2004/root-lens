package android.os;

public final class SystemClock {
    public static long nowMs;

    public static long elapsedRealtimeNanos() {
        return nowMs * 1_000_000L;
    }
}
