package io.rootlens.mentra;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.os.Bundle;
import android.os.Process;
import android.system.ErrnoException;
import android.system.Os;
import android.system.OsConstants;

import java.io.File;
import java.io.FileDescriptor;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.UUID;

/** Measures storage operations in an isolated fixture under the target application's UID. */
public final class CaptureStorageInstrumentation extends Instrumentation {
    private static final byte[] PAYLOAD = new byte[] {82, 76, 83, 89, 78, 67};

    @Override
    public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        start();
    }

    @Override
    public void onStart() {
        Bundle results = new Bundle();
        Path fixture = null;
        boolean probeCompleted = false;
        try {
            Context target = getTargetContext();
            results.putString("target_package", target.getPackageName());
            results.putInt("process_uid", Process.myUid());
            results.putInt("target_uid", target.getApplicationInfo().uid);
            if (Process.myUid() != target.getApplicationInfo().uid) {
                throw new IOException("Instrumentation is not running under the target UID");
            }
            File external = target.getExternalFilesDir(null);
            if (external == null) throw new IOException("External files directory is unavailable");

            Path candidate = new File(external,
                    "rootlens-storage-probe-" + UUID.randomUUID()).toPath();
            Files.createDirectory(candidate);
            fixture = candidate;
            results.putString("fixture", fixture.toString());
            results.putBoolean("fixture_created", true);
            Path partial = fixture.resolve("probe.partial");
            Path completed = fixture.resolve("probe.complete");
            try (RandomAccessFile output = new RandomAccessFile(partial.toFile(), "rw")) {
                output.write(PAYLOAD);
                output.getFD().sync();
                results.putString("payload_fsync", "ok");
            }

            measureDirectorySync(fixture, "directory_fsync", results);
            Files.move(partial, completed, StandardCopyOption.ATOMIC_MOVE);
            boolean contentMatches = Files.size(completed) == PAYLOAD.length
                    && Arrays.equals(Files.readAllBytes(completed), PAYLOAD);
            boolean atomicMove = contentMatches && !Files.exists(partial);
            results.putBoolean("atomic_move", atomicMove);
            results.putInt("payload_bytes", PAYLOAD.length);
            if (!atomicMove) throw new IOException("Atomic move did not preserve the fixture payload");
            measureDirectorySync(fixture, "directory_fsync_after_move", results);
            probeCompleted = true;
        } catch (IOException | RuntimeException error) {
            results.putString("probe_error_type", error.getClass().getName());
            results.putString("probe_error", error.toString());
        } finally {
            boolean cleaned = cleanup(fixture, results);
            results.putBoolean("own_probe_files_removed", cleaned);
            results.putBoolean("probe_completed", probeCompleted);
            // A reported fsync errno is a measurement; successful execution does not assert support.
            finish(probeCompleted && cleaned ? Activity.RESULT_OK : Activity.RESULT_CANCELED, results);
        }
    }

    private static void measureDirectorySync(Path directory, String key, Bundle results) {
        FileDescriptor descriptor = null;
        String operation = "open";
        try {
            descriptor = Os.open(directory.toString(), OsConstants.O_RDONLY, 0);
            results.putString(key + "_open", "ok");
            operation = "fsync";
            Os.fsync(descriptor);
            results.putString(key, "ok");
        } catch (ErrnoException error) {
            results.putString(key, "error");
            results.putInt(key + "_errno", error.errno);
            results.putString(key + "_operation", operation);
        } finally {
            if (descriptor != null) {
                try {
                    Os.close(descriptor);
                } catch (ErrnoException error) {
                    results.putInt(key + "_close_errno", error.errno);
                }
            }
        }
    }

    private static boolean cleanup(Path fixture, Bundle results) {
        if (fixture == null) return true;
        boolean cleaned = true;
        for (Path path : new Path[] {
                fixture.resolve("probe.partial"), fixture.resolve("probe.complete"), fixture}) {
            try {
                Files.deleteIfExists(path);
            } catch (IOException | RuntimeException error) {
                cleaned = false;
                results.putString("cleanup_error_" + path.getFileName(), error.toString());
            }
        }
        return cleaned;
    }
}
