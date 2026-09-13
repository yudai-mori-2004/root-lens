package io.rootlens.mentra;

import java.io.Closeable;
import java.io.File;
import java.io.IOException;

/** Disk-backed ordered timestamps, optimized for association to successive video frames. */
final class TimestampIndex implements Closeable {
    private final FixedRecordStore records;
    private long lastTimestamp = Long.MIN_VALUE;
    private long lastTarget = Long.MIN_VALUE;
    private int lastFloor = -1;

    TimestampIndex(File file) throws IOException {
        records = new FixedRecordStore(file, 1);
    }

    synchronized int add(long value) throws IOException {
        if (value < lastTimestamp) throw new IOException("Sensor timestamps moved backwards");
        int index = records.append(value);
        lastTimestamp = value;
        return index;
    }

    synchronized void finishWriting() throws IOException {
        records.finishWriting();
    }

    synchronized int size() {
        return records.size();
    }

    synchronized long get(int index) throws IOException {
        return records.get(index, 0);
    }

    synchronized int floorIndex(long target) throws IOException {
        int count = size();
        if (target >= lastTarget) {
            while (lastFloor + 1 < count && get(lastFloor + 1) <= target) lastFloor++;
        } else {
            int low = 0;
            int high = count - 1;
            while (low <= high) {
                int mid = (low + high) >>> 1;
                if (get(mid) <= target) low = mid + 1;
                else high = mid - 1;
            }
            lastFloor = high;
        }
        lastTarget = target;
        return lastFloor;
    }

    @Override
    public synchronized void close() throws IOException {
        records.close();
    }
}
