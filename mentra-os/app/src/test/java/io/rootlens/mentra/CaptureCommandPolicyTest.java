package io.rootlens.mentra;

final class CaptureCommandPolicyTest {
    public static void main(String[] args) {
        CaptureCommandPolicy policy = new CaptureCommandPolicy();
        check(policy.accept("stop-a", "start-a", true, () -> false),
                CaptureCommandPolicy.Decision.STOP_WITHOUT_PERSISTENCE);
        // The same process-level policy survives destruction of the stopped service.
        check(policy.accept("stop-a", "start-a", false, () -> { throw new AssertionError(); }),
                CaptureCommandPolicy.Decision.DUPLICATE);
        check(policy.accept("start-b", "start-a", false, () -> true),
                CaptureCommandPolicy.Decision.ACCEPT);
        check(policy.accept("stop-a", "start-b", false, () -> { throw new AssertionError(); }),
                CaptureCommandPolicy.Decision.DUPLICATE);
        check(policy.accept("stop-b", "start-b", true, () -> { throw new IllegalStateException(); }),
                CaptureCommandPolicy.Decision.STOP_WITHOUT_PERSISTENCE);
        check(policy.accept("start-c", "start-b", false, () -> false),
                CaptureCommandPolicy.Decision.REJECT);
        check(policy.accept("start-c", "start-b", false, () -> { throw new AssertionError(); }),
                CaptureCommandPolicy.Decision.DUPLICATE);
        check(new CaptureCommandPolicy().accept("persisted", "persisted", false,
                () -> { throw new AssertionError(); }), CaptureCommandPolicy.Decision.DUPLICATE);
        check(policy.accept(null, null, true, () -> { throw new AssertionError(); }),
                CaptureCommandPolicy.Decision.ACCEPT);
        System.out.println("CaptureCommandPolicy tests passed");
    }

    private static void check(CaptureCommandPolicy.Decision actual, CaptureCommandPolicy.Decision expected) {
        if (actual != expected) throw new AssertionError(actual + " != " + expected);
    }
}
