package io.rootlens.mentra;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

public final class CaptureFileCommitTest {
    private static final String[] PAYLOADS = {"rgb.mp4", "imu.jsonl", "frames.jsonl", "camera_frames.raw.jsonl"};

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("rootlens-file-commit-test-");
        try {
            successfulPublication(root.resolve("success"), true);
            successfulPublication(root.resolve("unsupported-directory-sync"), false);
            failedPayloadSyncDoesNotPublish(root.resolve("failed-file-sync"));
            failedDirectorySyncDoesNotPublish(root.resolve("failed-directory-sync"));
            failedMetadataWriteDoesNotPublish(root.resolve("failed-metadata"));
            unexpectedFilesDoNotPublish(root.resolve("missing-payload"));
            existingMetadataIsNotOverwritten(root.resolve("existing-metadata"));
            System.out.println("Capture file commit tests passed");
        } finally { removeTree(root); }
    }

    private static void successfulPublication(Path directory, boolean directorySupported) throws Exception {
        createPayloads(directory);
        List<String> synced = new ArrayList<>();
        int[] directoryCalls = {0};
        CaptureFileCommit.publish(directory.toFile(), PAYLOADS, (metadata, supported) -> {
            check(synced.equals(Arrays.asList(PAYLOADS)), "All payloads must be synced before metadata is written");
            check(directoryCalls[0] == 1, "Payload names must be synced before the completion marker");
            check(supported == directorySupported, "Unsupported directory sync must remain visible in metadata");
            write(metadata.toPath(), "{\"directory_fsync_supported\":" + supported + "}");
        }, new CaptureFileCommit.Sync() {
            public void file(File file) throws IOException {
                CaptureFileCommit.syncFile(file);
                synced.add(file.getName());
            }
            public boolean directory(File file) {
                directoryCalls[0]++;
                return directorySupported;
            }
        });
        check(Files.isRegularFile(directory.resolve("metadata.json")), "Completed metadata must be published");
        check(!Files.exists(directory.resolve("metadata.json.partial")), "Atomic rename must remove the partial marker");
        check(synced.contains("metadata.json.partial"), "Metadata bytes must be synced before publication");
        check(directoryCalls[0] == 2, "The completion marker name must be synced after publication");
        unchangedPayloads(directory);
    }

    private static void failedPayloadSyncDoesNotPublish(Path directory) throws Exception {
        createPayloads(directory);
        expectIOException(() -> CaptureFileCommit.publish(directory.toFile(), PAYLOADS,
                (file, supported) -> { throw new AssertionError("Metadata must not be written after a failed payload sync"); },
                new CaptureFileCommit.Sync() {
                    public void file(File file) throws IOException { throw new IOException("fixture ENOSPC"); }
                    public boolean directory(File file) { throw new AssertionError("Must stop at the failed payload"); }
                }));
        noMetadata(directory);
        unchangedPayloads(directory);
    }

    private static void failedDirectorySyncDoesNotPublish(Path directory) throws Exception {
        createPayloads(directory);
        expectIOException(() -> CaptureFileCommit.publish(directory.toFile(), PAYLOADS,
                (file, supported) -> { throw new AssertionError("Actual I/O failures must stop metadata publication"); },
                new CaptureFileCommit.Sync() {
                    public void file(File file) throws IOException { CaptureFileCommit.syncFile(file); }
                    public boolean directory(File file) throws IOException { throw new IOException("fixture EIO"); }
                }));
        noMetadata(directory);
        unchangedPayloads(directory);
    }

    private static void failedMetadataWriteDoesNotPublish(Path directory) throws Exception {
        createPayloads(directory);
        expectIOException(() -> CaptureFileCommit.publish(directory.toFile(), PAYLOADS,
                (file, supported) -> {
                    write(file.toPath(), "incomplete metadata");
                    throw new IOException("fixture interrupted metadata write");
                }, diskSync()));
        check(!Files.exists(directory.resolve("metadata.json")), "A failed metadata write must never look complete");
        check(Files.exists(directory.resolve("metadata.json.partial")), "Failure evidence must remain available");
        unchangedPayloads(directory);
    }

    private static void unexpectedFilesDoNotPublish(Path directory) throws Exception {
        createPayloads(directory);
        Files.delete(directory.resolve("frames.jsonl"));
        expectIOException(() -> CaptureFileCommit.publish(directory.toFile(), PAYLOADS,
                (file, supported) -> write(file.toPath(), "{}"), diskSync()));
        noMetadata(directory);
        Files.createSymbolicLink(directory.resolve("frames.jsonl"), directory.resolve("rgb.mp4"));
        expectIOException(() -> CaptureFileCommit.publish(directory.toFile(), PAYLOADS,
                (file, supported) -> write(file.toPath(), "{}"), diskSync()));
        noMetadata(directory);
    }

    private static void existingMetadataIsNotOverwritten(Path directory) throws Exception {
        createPayloads(directory);
        write(directory.resolve("metadata.json"), "existing recording");
        expectIOException(() -> CaptureFileCommit.publish(directory.toFile(), PAYLOADS,
                (file, supported) -> write(file.toPath(), "replacement"), diskSync()));
        check(read(directory.resolve("metadata.json")).equals("existing recording"), "Existing metadata must remain untouched");
    }

    private static CaptureFileCommit.Sync diskSync() {
        return new CaptureFileCommit.Sync() {
            public void file(File file) throws IOException { CaptureFileCommit.syncFile(file); }
            public boolean directory(File file) { return true; }
        };
    }
    private static void createPayloads(Path directory) throws IOException {
        Files.createDirectory(directory);
        for (String name : PAYLOADS) write(directory.resolve(name), "original " + name);
    }
    private static void unchangedPayloads(Path directory) throws IOException {
        for (String name : PAYLOADS) check(read(directory.resolve(name)).equals("original " + name), "Payload bytes changed");
    }
    private static void noMetadata(Path directory) {
        check(!Files.exists(directory.resolve("metadata.json")) && !Files.exists(directory.resolve("metadata.json.partial")), "Metadata should not exist");
    }
    private static Path write(Path path, String value) throws IOException {
        return Files.write(path, value.getBytes(StandardCharsets.UTF_8));
    }
    private static String read(Path path) throws IOException {
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
    }
    private interface Action { void run() throws Exception; }
    private static void expectIOException(Action action) throws Exception {
        try { action.run(); throw new AssertionError("Expected IOException"); }
        catch (IOException expected) { }
    }
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static void removeTree(Path directory) throws IOException {
        try (var paths = Files.walk(directory)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.delete(path);
        }
    }
}
