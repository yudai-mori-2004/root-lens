package io.rootlens.mentra;

import java.io.BufferedOutputStream;
import java.io.Closeable;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;

/** Append-only local scratch records with a fixed-size cache for finalized random reads. */
final class FixedRecordStore implements Closeable {
    private static final int PAGE_WORDS = 8192;
    private final File file;
    private final int recordWords;
    private final byte[] pageBytes = new byte[PAGE_WORDS * Long.BYTES];
    private final ByteBuffer page = ByteBuffer.wrap(pageBytes);
    private FileOutputStream output;
    private DataOutputStream writer;
    private RandomAccessFile reader;
    private int size;
    private long pageStart = -1;
    private int pageLength;

    FixedRecordStore(File file, int recordWords) throws IOException {
        if (recordWords <= 0) throw new IllegalArgumentException("Record width must be positive");
        this.file = file;
        this.recordWords = recordWords;
        output = new FileOutputStream(file);
        writer = new DataOutputStream(new BufferedOutputStream(
                output, PAGE_WORDS * Long.BYTES));
    }

    synchronized int append(long... values) throws IOException {
        if (writer == null) throw new IOException("Record store is no longer writable");
        if (values.length != recordWords) throw new IllegalArgumentException("Wrong record width");
        if (size == Integer.MAX_VALUE) throw new IOException("Record index capacity exceeded");
        for (long value : values) writer.writeLong(value);
        return size++;
    }

    synchronized void finishWriting() throws IOException {
        if (reader != null) return;
        if (writer == null) throw new IOException("Record store is closed");
        try {
            writer.flush();
            output.getFD().sync();
        } finally {
            try {
                writer.close();
            } finally {
                writer = null;
                output = null;
            }
        }
        reader = new RandomAccessFile(file, "r");
        long expectedBytes = (long) size * recordWords * Long.BYTES;
        if (reader.length() != expectedBytes) throw new IOException("Incomplete record index");
    }

    synchronized int size() {
        return size;
    }

    synchronized long get(int index, int field) throws IOException {
        if (index < 0 || index >= size || field < 0 || field >= recordWords) {
            throw new IndexOutOfBoundsException("Record " + index + ", field " + field);
        }
        if (reader == null) throw new IOException("Record index is not finalized");
        long word = (long) index * recordWords + field;
        if (word < pageStart || word >= pageStart + pageLength) {
            long nextStart = word / PAGE_WORDS * PAGE_WORDS;
            int nextLength = (int) Math.min(PAGE_WORDS, (long) size * recordWords - nextStart);
            pageStart = -1;
            pageLength = 0;
            reader.seek(nextStart * Long.BYTES);
            reader.readFully(pageBytes, 0, nextLength * Long.BYTES);
            pageStart = nextStart;
            pageLength = nextLength;
        }
        return page.getLong((int) (word - pageStart) * Long.BYTES);
    }

    @Override
    public synchronized void close() throws IOException {
        try {
            if (writer != null) {
                try {
                    writer.flush();
                    if (output != null) output.getFD().sync();
                } finally {
                    try {
                        writer.close();
                    } finally {
                        writer = null;
                        output = null;
                    }
                }
            }
        } finally {
            if (reader != null) reader.close();
            reader = null;
        }
    }
}
