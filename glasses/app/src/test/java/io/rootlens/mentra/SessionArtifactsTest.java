package io.rootlens.mentra;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;

public final class SessionArtifactsTest {
    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("rootlens-session-artifacts-test-");
        try {
            missingInternalVideoFrame(root.resolve("missing-video"));
            missingInternalCameraFrame(root.resolve("missing-camera"));
            agreementBoundary();
            cancelledSessionRemovesOnlyItsOwnScratch(root.resolve("cancel"));
            cancelledSessionRejectsUnexpectedOrFinalFiles(root.resolve("reject"));
            cancelledSessionRejectsCapturedFrames(root.resolve("captured"));
            System.out.println("Session artifact alignment and cancellation tests passed");
        } finally {
            try (var paths = Files.walk(root)) {
                for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.delete(path);
            }
        }
    }

    private static void missingInternalVideoFrame(Path root) throws Exception {
        Object alignment = align(root, new int[]{0, 1, 2, 3}, new int[]{0, 1, 3});
        equal(3, number(alignment, "pairedCount"));
        equal(2, number(alignment, "verifiedPairCount"));
        equal(1, number(alignment, "sampleCount") - number(alignment, "verifiedPairCount"));
        check(!agrees(2 * step(), 3 * step()), "A dropped video frame must not attach the preceding camera result");
    }
    private static void missingInternalCameraFrame(Path root) throws Exception {
        Object alignment = align(root, new int[]{0, 1, 3}, new int[]{0, 1, 2, 3});
        equal(2, number(alignment, "verifiedPairCount"));
        equal(2, number(alignment, "sampleCount") - number(alignment, "verifiedPairCount"));
        check(!agrees(3 * step(), 2 * step()), "A missing camera result must not attach the following result");
    }
    private static void agreementBoundary() throws Exception {
        check(agrees(100_000, 100_000), "Equal timestamps must match");
        check(agrees(step() / 2 - 1, 0), "Sub-half-frame differences stay eligible");
        check(!agrees(step() / 2, 0), "A half-frame mismatch must be explicit missing data");
        check(!agrees(0, step() / 2), "The threshold must apply to both signs");
    }
    private static boolean agrees(long camera, long sample) throws Exception {
        Method method = SessionArtifacts.class.getDeclaredMethod("timestampsAgree", long.class, long.class, long.class, long.class);
        method.setAccessible(true);
        return (boolean) method.invoke(null, camera, sample, 0L, 0L);
    }
    private static long step() { return 1_000_000_000L / AppContract.FPS; }

    private static Object align(Path root, int[] cameraTimes, int[] videoTimes) throws Exception {
        Files.createDirectory(root);
        Object camera = records("FrameRecords", root.resolve("camera.bin").toFile());
        Object video = records("VideoSamples", root.resolve("video.bin").toFile());
        try {
            for (int value : cameraTimes) {
                SessionArtifacts.FrameRecord frame = new SessionArtifacts.FrameRecord();
                frame.frameNumber = value;
                frame.sensorTimestampNs = value * step();
                call(camera, "add", new Class<?>[]{SessionArtifacts.FrameRecord.class}, frame);
            }
            for (int value : videoTimes) {
                SessionArtifacts.VideoSample sample = new SessionArtifacts.VideoSample();
                sample.ptsNs = value * step();
                sample.sizeBytes = 100;
                call(video, "add", new Class<?>[]{SessionArtifacts.VideoSample.class}, sample);
            }
            call(camera, "finishWriting", new Class<?>[]{});
            call(video, "finishWriting", new Class<?>[]{});
            Method method = SessionArtifacts.class.getDeclaredMethod("align", camera.getClass(), video.getClass());
            method.setAccessible(true);
            return method.invoke(null, camera, video);
        } finally {
            call(camera, "close", new Class<?>[]{});
            call(video, "close", new Class<?>[]{});
        }
    }
    private static Object records(String name, File file) throws Exception {
        Class<?> type = Class.forName("io.rootlens.mentra.SessionArtifacts$" + name);
        Constructor<?> constructor = type.getDeclaredConstructor(File.class);
        constructor.setAccessible(true);
        return constructor.newInstance(file);
    }
    private static Object call(Object target, String name, Class<?>[] types, Object... values) throws Exception {
        Method method = target.getClass().getDeclaredMethod(name, types);
        method.setAccessible(true);
        return method.invoke(target, values);
    }
    private static long number(Object target, String name) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        return ((Number) field.get(target)).longValue();
    }

    private static void cancelledSessionRemovesOnlyItsOwnScratch(Path root) throws Exception {
        Files.createDirectory(root);
        Path old = Files.createDirectory(root.resolve("rec-20000101T000000.000Z"));
        write(old.resolve("rgb.mp4.partial"), "existing unfinished recording");
        SessionArtifacts session = SessionArtifacts.create(root.toFile());
        write(session.partialImu.toPath(), "pre-start IMU samples");
        write(session.partialVideo.toPath(), "preparation header");
        session.discardCancelled();
        session.discardCancelled();
        check(!session.directory.exists(), "The never-started session must not remain as a failed recording");
        check(read(old.resolve("rgb.mp4.partial")).equals("existing unfinished recording"), "Older partials must remain untouched");
    }
    private static void cancelledSessionRejectsUnexpectedOrFinalFiles(Path root) throws Exception {
        Files.createDirectory(root);
        for (String name : new String[]{"metadata.json", "rgb.mp4", "unknown.bin"}) {
            SessionArtifacts session = SessionArtifacts.create(Files.createDirectory(root.resolve(name)).toFile());
            write(new File(session.directory, name).toPath(), "keep");
            expectRejected(session);
            check(session.partialCameraFrames.exists(), "Validation must precede deletion of any scratch file");
            check(read(new File(session.directory, name).toPath()).equals("keep"), "Unexpected files must remain untouched");
        }
        SessionArtifacts linked = SessionArtifacts.create(Files.createDirectory(root.resolve("linked")).toFile());
        Path target = write(root.resolve("outside.bin"), "outside");
        Files.createSymbolicLink(linked.partialVideo.toPath(), target);
        expectRejected(linked);
        check(read(target).equals("outside"), "Linked files must remain untouched");
    }
    private static void cancelledSessionRejectsCapturedFrames(Path root) throws Exception {
        SessionArtifacts session = SessionArtifacts.create(root.toFile());
        Field field = SessionArtifacts.class.getDeclaredField("cameraFrames");
        field.setAccessible(true);
        Object records = field.get(session);
        call(records, "add", new Class<?>[]{SessionArtifacts.FrameRecord.class}, new SessionArtifacts.FrameRecord());
        expectRejected(session);
        check(session.directory.exists(), "A session containing camera frames must not be discarded");
    }
    private static void expectRejected(SessionArtifacts session) throws Exception {
        try { session.discardCancelled(); throw new AssertionError("Expected cancelled cleanup rejection"); }
        catch (IOException expected) { }
    }
    private static Path write(Path path, String value) throws IOException {
        return Files.write(path, value.getBytes(StandardCharsets.UTF_8));
    }
    private static String read(Path path) throws IOException {
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
    }
    private static void equal(long expected, long actual) { check(expected == actual, "Expected " + expected + ", got " + actual); }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
}
