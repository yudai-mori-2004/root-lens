package io.rootlens.mentra;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.StandardCopyOption;

/** Publish the completion marker only after all recording payloads have been synced. */
final class CaptureFileCommit {
    interface Sync {
        void file(File file) throws IOException;
        boolean directory(File directory) throws IOException;
    }

    interface MetadataWriter {
        void write(File partialMetadata, boolean directorySyncSupported) throws IOException;
    }

    static void publish(File directory, String[] payloadNames, MetadataWriter writer, Sync sync)
            throws IOException {
        File partial = new File(directory, "metadata.json.partial");
        File completed = new File(directory, "metadata.json");
        if (Files.exists(partial.toPath(), LinkOption.NOFOLLOW_LINKS)
                || Files.exists(completed.toPath(), LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException("Metadata publication was already attempted");
        }
        for (String name : payloadNames) {
            File payload = new File(directory, name);
            requireFile(payload);
            sync.file(payload);
        }
        boolean directorySyncSupported = sync.directory(directory);
        writer.write(partial, directorySyncSupported);
        requireFile(partial);
        sync.file(partial);
        Files.move(partial.toPath(), completed.toPath(), StandardCopyOption.ATOMIC_MOVE);
        sync.directory(directory);
    }

    static void syncFile(File file) throws IOException {
        requireFile(file);
        try (RandomAccessFile opened = new RandomAccessFile(file, "rw")) {
            opened.getFD().sync();
        }
    }

    private static void requireFile(File file) throws IOException {
        if (!Files.isRegularFile(file.toPath(), LinkOption.NOFOLLOW_LINKS) || file.length() == 0) {
            throw new IOException("Missing or empty capture artifact: " + file.getName());
        }
    }

    private CaptureFileCommit() {}
}
