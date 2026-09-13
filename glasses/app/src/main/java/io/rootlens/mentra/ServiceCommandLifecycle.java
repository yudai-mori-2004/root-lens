package io.rootlens.mentra;

/** Coordinates Android start delivery with commands processed by a service's serial executor. */
final class ServiceCommandLifecycle {
    private int latestDeliveredStartId;
    private int latestHandledStartId;
    private boolean destroyed;

    synchronized boolean delivered(int startId) {
        if (destroyed) return false;
        latestDeliveredStartId = startId;
        return true;
    }

    synchronized boolean beginHandling(int startId) {
        if (destroyed) return false;
        latestHandledStartId = startId;
        return true;
    }

    synchronized int handledStartId() {
        return latestHandledStartId;
    }

    synchronized boolean canStop(int startId) {
        return !destroyed && startId != 0
                && startId == latestDeliveredStartId && startId == latestHandledStartId;
    }

    synchronized void destroy() {
        destroyed = true;
    }

    synchronized boolean isDestroyed() {
        return destroyed;
    }
}
