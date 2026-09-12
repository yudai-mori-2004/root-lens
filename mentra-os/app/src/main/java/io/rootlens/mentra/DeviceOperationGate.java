package io.rootlens.mentra;

/** Process-local ownership of the physical camera/IMU path, retained through engine cleanup. */
final class DeviceOperationGate {
    enum Owner { NONE, CAPTURE, CALIBRATION }

    static final class Lease {
        final Owner owner;
        final long token;
        private boolean claimed;

        private Lease(Owner owner, long token, boolean claimed) {
            this.owner = owner;
            this.token = token;
            this.claimed = claimed;
        }
    }

    private static Lease active;
    private static long nextToken;

    static synchronized Lease tryAcquire(Owner requested) {
        return acquire(requested, true);
    }

    static synchronized long reserve(Owner requested) {
        Lease lease = acquire(requested, false);
        return lease == null ? 0L : lease.token;
    }

    private static Lease acquire(Owner requested, boolean claimed) {
        if (requested == Owner.NONE) throw new IllegalArgumentException("NONE cannot acquire");
        if (active != null) return null;
        active = new Lease(requested, ++nextToken, claimed);
        return active;
    }

    static synchronized Lease claim(Owner expected, long token) {
        if (active == null || active.owner != expected || active.token != token
                || active.claimed) return null;
        active.claimed = true;
        return active;
    }

    static synchronized void releaseReservation(long token) {
        if (active != null && active.token == token && !active.claimed) active = null;
    }

    static synchronized boolean isOwnedBy(Owner expected) {
        return owner() == expected;
    }

    static synchronized Owner owner() {
        return active == null ? Owner.NONE : active.owner;
    }

    static synchronized void release(Lease expected) {
        if (active == expected) active = null;
    }

    private DeviceOperationGate() {}
}
