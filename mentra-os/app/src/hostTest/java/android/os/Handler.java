package android.os;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Deterministic callback queue; tests explicitly advance the monotonic clock. */
public final class Handler {
    private record Task(Runnable callback, long dueMs, long sequence) {}
    private static final List<Task> TASKS = new ArrayList<>();
    private static long nextSequence;
    public static boolean dispatching;

    public Handler(Looper looper) {}

    public boolean post(Runnable callback) {
        return postDelayed(callback, 0);
    }

    public boolean postDelayed(Runnable callback, long delayMs) {
        TASKS.add(new Task(callback, SystemClock.nowMs + delayMs, nextSequence++));
        return true;
    }

    public void removeCallbacks(Runnable callback) {
        TASKS.removeIf(task -> task.callback() == callback);
    }

    public static void reset() {
        TASKS.clear();
        SystemClock.nowMs = 0;
        dispatching = false;
    }

    public static void drain() {
        while (true) {
            Task next = TASKS.stream()
                    .filter(task -> task.dueMs() <= SystemClock.nowMs)
                    .min(Comparator.comparingLong(Task::dueMs).thenComparingLong(Task::sequence))
                    .orElse(null);
            if (next == null) return;
            TASKS.remove(next);
            dispatching = true;
            try {
                next.callback().run();
            } finally {
                dispatching = false;
            }
        }
    }

    public static void advanceBy(long milliseconds) {
        SystemClock.nowMs += milliseconds;
        drain();
    }
}
