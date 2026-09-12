package io.rootlens.mentra;

final class ServiceCommandLifecycleTest {
    public static void main(String[] args) {
        ServiceCommandLifecycle service = new ServiceCommandLifecycle();
        check(service.delivered(1));
        check(service.beginHandling(1));
        int finishingStartId = service.handledStartId();
        check(service.canStop(finishingStartId));

        // A new command already delivered to Android must survive an older finish callback.
        check(service.delivered(2));
        check(!service.canStop(finishingStartId));
        check(!service.canStop(2));
        check(service.beginHandling(2));
        check(!service.canStop(finishingStartId));
        check(service.canStop(service.handledStartId()));

        // Destroying the service prevents queued commands from reopening the camera.
        check(service.delivered(3));
        service.destroy();
        check(service.isDestroyed());
        check(!service.beginHandling(3));
        check(!service.delivered(4));
        check(!service.canStop(service.handledStartId()));
        System.out.println("ServiceCommandLifecycle tests passed");
    }

    private static void check(boolean condition) {
        if (!condition) throw new AssertionError();
    }
}
