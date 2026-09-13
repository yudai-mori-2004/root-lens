#!/usr/bin/env python3
"""Validate and extract a RootLens EOS2 capture chunk."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
import struct
import zlib

MAGIC = b"EOS2"
VERSION = 2
HEADER = struct.Struct(">4sHHIQQIII")
VIDEO_PREFIX = struct.Struct(">IIQ")
CHUNK_FOOTER = struct.Struct(">IQQQ32s")
TYPE_VIDEO_PAIR = 1
TYPE_IMU_BATCH = 2
TYPE_EVENT = 3
TYPE_CHUNK_END = 4
MAX_PAYLOAD = 2 * 1024 * 1024
IMU_COLUMNS = ["index", "ax", "ay", "az", "gx", "gy", "gz", "mx", "my", "mz", "fsn", "fsd"]


class FormatError(ValueError):
    pass


@dataclass(frozen=True)
class Record:
    record_type: int
    flags: int
    sequence: int
    capture_monotonic_us: int
    payload: bytes
    encoded: bytes


def crc32(data: bytes) -> int:
    return zlib.crc32(data) & 0xFFFFFFFF


def parse_oscar_imu_line(line: str) -> list[int | str] | None:
    if not line.startswith("G0,"):
        return None
    fields = line[3:].removesuffix(";").split(",")
    if len(fields) < 10:
        return None
    try:
        index = int(fields[0], 16)
        signed_axes: list[int] = []
        for field in fields[1:10]:
            value = int(field, 16)
            signed_axes.append(value - 0x10000 if value >= 0x8000 else value)
        fsn: int | str = int(fields[10], 16) if len(fields) >= 11 and fields[10] else ""
        fsd: int | str = int(fields[11], 16) if len(fields) >= 12 and fields[11] else ""
        return [index, *signed_axes, fsn, fsd]
    except ValueError:
        return None


def encode_record(
    record_type: int,
    sequence: int,
    capture_monotonic_us: int,
    payload: bytes,
    flags: int = 0,
) -> bytes:
    if len(payload) > MAX_PAYLOAD:
        raise FormatError("payload exceeds 2 MiB")
    first_36 = struct.pack(
        ">4sHHIQQII",
        MAGIC,
        VERSION,
        record_type,
        flags,
        sequence,
        capture_monotonic_us,
        len(payload),
        crc32(payload),
    )
    return first_36 + struct.pack(">I", crc32(first_36)) + payload


def read_records(path: Path, allow_truncated_tail: bool = False) -> list[Record]:
    records: list[Record] = []
    with path.open("rb") as source:
        while True:
            header = source.read(HEADER.size)
            if not header:
                break
            if len(header) != HEADER.size:
                if allow_truncated_tail:
                    break
                raise FormatError("truncated record header")
            (
                magic,
                version,
                record_type,
                flags,
                sequence,
                capture_us,
                payload_length,
                payload_crc,
                header_crc,
            ) = HEADER.unpack(header)
            if magic != MAGIC or version != VERSION:
                raise FormatError("bad EOS2 magic or version")
            if crc32(header[:36]) != header_crc:
                raise FormatError(f"header CRC mismatch at sequence {sequence}")
            if payload_length > MAX_PAYLOAD:
                raise FormatError("payload exceeds 2 MiB")
            payload = source.read(payload_length)
            if len(payload) != payload_length:
                if allow_truncated_tail:
                    break
                raise FormatError(f"truncated payload at sequence {sequence}")
            if crc32(payload) != payload_crc:
                if allow_truncated_tail:
                    break
                raise FormatError(f"payload CRC mismatch at sequence {sequence}")
            records.append(
                Record(
                    record_type,
                    flags,
                    sequence,
                    capture_us,
                    payload,
                    header + payload,
                )
            )
    return records


def validate_chunk(records: list[Record]) -> tuple[int, int, int, int]:
    if not records or records[-1].record_type != TYPE_CHUNK_END:
        raise FormatError("chunk has no final CHUNK_END record")
    footer = records[-1]
    if len(footer.payload) != CHUNK_FOOTER.size:
        raise FormatError("bad CHUNK_END payload length")
    chunk_index, first_sequence, last_sequence, data_bytes, expected_sha = (
        CHUNK_FOOTER.unpack(footer.payload)
    )
    data = b"".join(record.encoded for record in records[:-1])
    if len(data) != data_bytes:
        raise FormatError("chunk byte count mismatch")
    if hashlib.sha256(data).digest() != expected_sha:
        raise FormatError("chunk SHA-256 mismatch")
    sequences = [record.sequence for record in records[:-1]]
    if sequences:
        if sequences[0] != first_sequence or sequences[-1] != last_sequence:
            raise FormatError("chunk sequence range mismatch")
        for previous, current in zip(sequences, sequences[1:]):
            if current <= previous:
                raise FormatError("record sequence is not strictly increasing")
    return chunk_index, first_sequence, last_sequence, data_bytes


def extract(source: Path, output: Path, salvage: bool = False) -> dict[str, int | bool]:
    records = read_records(source, allow_truncated_tail=salvage)
    recovered = False
    if records and records[-1].record_type == TYPE_CHUNK_END:
        chunk_index, first_sequence, last_sequence, data_bytes = validate_chunk(records)
        data_records = records[:-1]
    elif salvage and records:
        recovered = True
        data_records = records
        name = source.name.split(".", 1)[0]
        chunk_index = int(name) if name.isdigit() else 0
        first_sequence = data_records[0].sequence
        last_sequence = data_records[-1].sequence
        data_bytes = sum(len(record.encoded) for record in data_records)
    else:
        raise FormatError("chunk has no final CHUNK_END record")
    output.mkdir(parents=True, exist_ok=True)

    video_count = 0
    imu_batch_count = 0
    event_count = 0
    with (
        (output / "left.h264").open("wb") as left_file,
        (output / "right.h264").open("wb") as right_file,
        (output / "sensor-uart.log").open("wb") as sensor_file,
        (output / "events.jsonl").open("wb") as event_file,
        (output / "pairs.csv").open("w", newline="", encoding="utf-8") as pair_file,
    ):
        pairs = csv.writer(pair_file)
        pairs.writerow(
            [
                "sequence",
                "capture_monotonic_us",
                "presentation_timestamp_90khz",
                "left_bytes",
                "right_bytes",
                "flags",
            ]
        )
        for record in data_records:
            if record.record_type == TYPE_VIDEO_PAIR:
                if len(record.payload) < VIDEO_PREFIX.size:
                    raise FormatError("short VIDEO_PAIR payload")
                left_len, right_len, timestamp = VIDEO_PREFIX.unpack_from(record.payload)
                expected = VIDEO_PREFIX.size + left_len + right_len
                if len(record.payload) != expected:
                    raise FormatError("VIDEO_PAIR length fields do not match payload")
                split = VIDEO_PREFIX.size + left_len
                left_file.write(record.payload[VIDEO_PREFIX.size:split])
                right_file.write(record.payload[split:])
                pairs.writerow(
                    [
                        record.sequence,
                        record.capture_monotonic_us,
                        timestamp,
                        left_len,
                        right_len,
                        record.flags,
                    ]
                )
                video_count += 1
            elif record.record_type == TYPE_IMU_BATCH:
                sensor_file.write(record.payload)
                if record.payload and not record.payload.endswith(b"\n"):
                    sensor_file.write(b"\n")
                imu_batch_count += 1
            elif record.record_type == TYPE_EVENT:
                json.loads(record.payload)
                event_file.write(record.payload + b"\n")
                event_count += 1
            else:
                raise FormatError(f"unknown record type {record.record_type}")

    sensor_log = (output / "sensor-uart.log").read_text(encoding="ascii", errors="replace")
    imu_rows = [
        parsed
        for line in sensor_log.splitlines()
        if (parsed := parse_oscar_imu_line(line)) is not None
    ]
    with (output / "imu.csv").open("w", newline="", encoding="ascii") as imu_file:
        imu_csv = csv.writer(imu_file, lineterminator="\n")
        imu_csv.writerow([f"# {IMU_COLUMNS[0]}", *IMU_COLUMNS[1:]])
        imu_csv.writerows(imu_rows)

    manifest = {
        "format": "EOS2",
        "version": VERSION,
        "chunk_index": chunk_index,
        "first_sequence": first_sequence,
        "last_sequence": last_sequence,
        "data_bytes": data_bytes,
        "video_pairs": video_count,
        "imu_batches": imu_batch_count,
        "imu_samples": len(imu_rows),
        "events": event_count,
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "recovered_from_partial": recovered,
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--salvage",
        action="store_true",
        help="extract every CRC-valid complete record from an interrupted .partial file",
    )
    arguments = parser.parse_args()
    print(json.dumps(extract(arguments.source, arguments.output, arguments.salvage), indent=2))


if __name__ == "__main__":
    main()
