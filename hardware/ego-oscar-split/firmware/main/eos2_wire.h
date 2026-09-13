#pragma once

#include <stddef.h>
#include <stdint.h>

enum {
    EOS2_VERSION = 2,
    EOS2_HEADER_SIZE = 40,
    EOS2_VIDEO_PREFIX_SIZE = 16,
    EOS2_CHUNK_FOOTER_SIZE = 60,
};

typedef enum {
    EOS2_VIDEO_PAIR = 1,
    EOS2_IMU_BATCH = 2,
    EOS2_EVENT = 3,
    EOS2_CHUNK_END = 4,
} eos2_record_type_t;

typedef struct {
    eos2_record_type_t type;
    uint32_t flags;
    uint64_t sequence;
    uint64_t capture_monotonic_us;
    uint32_t payload_length;
    uint32_t payload_crc32;
} eos2_record_description_t;

uint32_t eos2_crc32(const void *data, size_t length);

uint32_t eos2_crc32_update(uint32_t state, const void *data, size_t length);

void eos2_encode_header(
    uint8_t output[EOS2_HEADER_SIZE],
    const eos2_record_description_t *description);

void eos2_encode_video_prefix(
    uint8_t output[EOS2_VIDEO_PREFIX_SIZE],
    uint32_t left_length,
    uint32_t right_length,
    uint64_t presentation_timestamp_90khz);

void eos2_encode_chunk_footer(
    uint8_t output[EOS2_CHUNK_FOOTER_SIZE],
    uint32_t chunk_index,
    uint64_t first_sequence,
    uint64_t last_sequence,
    uint64_t data_bytes,
    const uint8_t sha256[32]);
