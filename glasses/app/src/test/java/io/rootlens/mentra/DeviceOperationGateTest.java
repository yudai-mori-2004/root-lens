package io.rootlens.mentra;

final class DeviceOperationGateTest {
    public static void main(String[] args) {
        DeviceOperationGate.Lease capture =
                DeviceOperationGate.tryAcquire(DeviceOperationGate.Owner.CAPTURE);
        check(capture != null);
        check(DeviceOperationGate.isOwnedBy(DeviceOperationGate.Owner.CAPTURE));
        check(DeviceOperationGate.tryAcquire(DeviceOperationGate.Owner.CAPTURE) == null);
        check(DeviceOperationGate.tryAcquire(DeviceOperationGate.Owner.CALIBRATION) == null);
        DeviceOperationGate.release(null);
        check(DeviceOperationGate.isOwnedBy(DeviceOperationGate.Owner.CAPTURE));
        DeviceOperationGate.release(capture);

        DeviceOperationGate.Lease replacement =
                DeviceOperationGate.tryAcquire(DeviceOperationGate.Owner.CAPTURE);
        check(replacement != null && replacement != capture);
        DeviceOperationGate.release(capture);
        check(DeviceOperationGate.isOwnedBy(DeviceOperationGate.Owner.CAPTURE));
        DeviceOperationGate.release(replacement);

        long reserved = DeviceOperationGate.reserve(DeviceOperationGate.Owner.CALIBRATION);
        check(reserved != 0L);
        check(DeviceOperationGate.reserve(DeviceOperationGate.Owner.CALIBRATION) == 0L);
        check(DeviceOperationGate.tryAcquire(DeviceOperationGate.Owner.CAPTURE) == null);
        check(DeviceOperationGate.claim(DeviceOperationGate.Owner.CAPTURE, reserved) == null);
        check(DeviceOperationGate.claim(DeviceOperationGate.Owner.CALIBRATION, reserved + 1L) == null);
        DeviceOperationGate.Lease calibration =
                DeviceOperationGate.claim(DeviceOperationGate.Owner.CALIBRATION, reserved);
        check(calibration != null);
        check(DeviceOperationGate.claim(DeviceOperationGate.Owner.CALIBRATION, reserved) == null);
        DeviceOperationGate.releaseReservation(reserved);
        check(DeviceOperationGate.isOwnedBy(DeviceOperationGate.Owner.CALIBRATION));
        DeviceOperationGate.release(calibration);

        long pending = DeviceOperationGate.reserve(DeviceOperationGate.Owner.CALIBRATION);
        DeviceOperationGate.releaseReservation(reserved);
        check(DeviceOperationGate.isOwnedBy(DeviceOperationGate.Owner.CALIBRATION));
        DeviceOperationGate.releaseReservation(pending);
        check(DeviceOperationGate.owner() == DeviceOperationGate.Owner.NONE);
        System.out.println("DeviceOperationGate tests passed");
    }

    private static void check(boolean condition) {
        if (!condition) throw new AssertionError();
    }
}
