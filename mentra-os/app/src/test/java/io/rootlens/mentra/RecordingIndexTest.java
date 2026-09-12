package io.rootlens.mentra;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Random;

public final class RecordingIndexTest {
    public static void main(String[] args) throws Exception {
        Path directory = Files.createTempDirectory("rootlens-recording-index-test-");
        try {
            pageBoundariesAndClosedStores(directory);
            floorLookupMatchesReference(directory);
            incompleteIndexIsRejected(directory);
            fiveHourRecording(directory);
            System.out.println("Recording index tests passed (5h at 30fps / 200Hz, 32MiB heap)");
        } finally {
            try (var files = Files.walk(directory)) {
                for (Path file : files.sorted(Comparator.reverseOrder()).toList()) Files.delete(file);
            }
        }
    }

    private static void pageBoundariesAndClosedStores(Path directory) throws Exception {
        try (FixedRecordStore records = new FixedRecordStore(directory.resolve("records.bin").toFile(), 9)) {
            expectIOException(() -> records.get(0, 0), true);
            for (int i = 0; i < 20_000; i++) {
                records.append(i, -i, i * 10L, i + 3, i + 4, -1, Long.MAX_VALUE, Long.MIN_VALUE, i + 8);
            }
            records.finishWriting();
            expectIOException(() -> records.append(new long[9]), false);
            for (int i : new int[] {0, 909, 910, 911, 8191, 8192, 19_999, 10, 9000}) {
                equal(i, records.get(i, 0));
                equal(-i, records.get(i, 1));
                equal(i * 10L, records.get(i, 2));
                equal(-1, records.get(i, 5));
                equal(Long.MAX_VALUE, records.get(i, 6));
                equal(Long.MIN_VALUE, records.get(i, 7));
                equal(i + 8, records.get(i, 8));
            }
            records.close();
            expectIOException(() -> records.get(0, 0), false);
        }
    }

    private static void floorLookupMatchesReference(Path directory) throws Exception {
        long[] reference = new long[20_000];
        try (TimestampIndex index = new TimestampIndex(directory.resolve("timestamps.bin").toFile())) {
            for (int i = 0; i < reference.length; i++) {
                reference[i] = (i / 3) * 5_000_000L;
                equal(i, index.add(reference[i]));
            }
            expectIOException(() -> index.add(-1), false);
            index.finishWriting();
            Random random = new Random(713);
            for (int i = 0; i < 2000; i++) {
                long target = i < 1000 ? (long) i * 50_000_000L - 1
                        : random.nextLong(reference[reference.length - 1] + 100_000_000L) - 1;
                int expected = -1;
                for (int j = 0; j < reference.length && reference[j] <= target; j++) expected = j;
                equal(expected, index.floorIndex(target));
            }
            equal(2, index.floorIndex(0));
            equal(-1, index.floorIndex(-1));
            equal(reference.length - 1, index.floorIndex(Long.MAX_VALUE));
        }
        try (TimestampIndex empty = new TimestampIndex(directory.resolve("empty.bin").toFile())) {
            empty.finishWriting();
            equal(-1, empty.floorIndex(100));
        }
    }

    private static void incompleteIndexIsRejected(Path directory) throws Exception {
        Path path = directory.resolve("truncated.bin");
        try (FixedRecordStore records = new FixedRecordStore(path.toFile(), 1)) {
            records.append(123);
            records.finishWriting();
            try (RandomAccessFile file = new RandomAccessFile(path.toFile(), "rw")) { file.setLength(2); }
            expectIOException(() -> records.get(0, 0), false);
            expectIOException(() -> records.get(0, 0), false);
        }
    }

    private static void fiveHourRecording(Path directory) throws Exception {
        int frameCount = 5 * 60 * 60 * 30;
        int sensorCount = 5 * 60 * 60 * 200;
        try (FixedRecordStore camera = new FixedRecordStore(directory.resolve("camera.bin").toFile(), 9);
                FixedRecordStore video = new FixedRecordStore(directory.resolve("video.bin").toFile(), 3);
                TimestampIndex accel = new TimestampIndex(directory.resolve("accel.bin").toFile());
                TimestampIndex gyro = new TimestampIndex(directory.resolve("gyro.bin").toFile())) {
            for (int i = 0; i < sensorCount; i++) {
                accel.add(i * 5_000_000L);
                gyro.add(i * 5_000_000L + 1_000_000L);
            }
            for (int i = 0; i < frameCount; i++) {
                long timestamp = i * 1_000_000_000L / 30;
                camera.append(i, timestamp, timestamp, timestamp + 2, timestamp + 1,
                        10_000_000, 33_333_333, 1_000_000, 100);
                video.append(timestamp, 32_000, i % 30 == 0 ? 1 : 0);
            }
            camera.finishWriting();
            video.finishWriting();
            accel.finishWriting();
            gyro.finishWriting();
            for (int i = 0; i < frameCount; i++) {
                long timestamp = i * 1_000_000_000L / 30;
                equal(timestamp, camera.get(i, 2));
                equal(timestamp, video.get(i, 0));
                equal(timestamp / 5_000_000L, accel.floorIndex(timestamp));
                equal(timestamp < 1_000_000L ? -1 : (timestamp - 1_000_000L) / 5_000_000L,
                        gyro.floorIndex(timestamp));
            }
            equal(sensorCount, accel.size());
            equal(sensorCount, gyro.size());
        }
    }

    private interface IoAction { void run() throws Exception; }

    private static void expectIOException(IoAction action, boolean allowBounds) throws Exception {
        try {
            action.run();
            throw new AssertionError("Expected a rejected operation");
        } catch (IOException expected) {
        } catch (IndexOutOfBoundsException expected) {
            if (!allowBounds) throw expected;
        }
    }

    private static void equal(long expected, long actual) {
        if (expected != actual) throw new AssertionError("Expected " + expected + ", got " + actual);
    }
}
