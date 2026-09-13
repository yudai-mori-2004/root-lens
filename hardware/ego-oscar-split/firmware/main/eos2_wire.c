#include "eos2_wire.h"

#include <string.h>

static void put_u16(uint8_t *output, uint16_t value)
{
    output[0] = (uint8_t)(value >> 8);
    output[1] = (uint8_t)value;
}

static void put_u32(uint8_t *output, uint32_t value)
{
    for (int index = 3; index >= 0; --index) {
        output[index] = (uint8_t)value;
        value >>= 8;
    }
}

static void put_u64(uint8_t *output, uint64_t value)
{
    for (int index = 7; index >= 0; --index) {
        output[index] = (uint8_t)value;
        value >>= 8;
    }
}

uint32_t eos2_crc32(const void *data, size_t length)
{
    return eos2_crc32_update(UINT32_MAX, data, length) ^ UINT32_MAX;
}

uint32_t eos2_crc32_update(uint32_t crc, const void *data, size_t length)
{
    const uint8_t *bytes = data;
    for (size_t byte_index = 0; byte_index < length; ++byte_index) {
        crc ^= bytes[byte_index];
        for (unsigned bit = 0; bit < 8; ++bit) {
            crc = (crc >> 1) ^ ((crc & 1U) ? UINT32_C(0xEDB88320) : 0U);
        }
    }
    return crc;
}

void eos2_encode_header(
    uint8_t output[EOS2_HEADER_SIZE],
    const eos2_record_description_t *description)
{
    memcpy(output, "EOS2", 4);
    put_u16(output + 4, EOS2_VERSION);
    put_u16(output + 6, (uint16_t)description->type);
    put_u32(output + 8, description->flags);
    put_u64(output + 12, description->sequence);
    put_u64(output + 20, description->capture_monotonic_us);
    put_u32(output + 28, description->payload_length);
    put_u32(output + 32, description->payload_crc32);
    put_u32(output + 36, eos2_crc32(output, 36));
}

void eos2_encode_video_prefix(
    uint8_t output[EOS2_VIDEO_PREFIX_SIZE],
    uint32_t left_length,
    uint32_t right_length,
    uint64_t presentation_timestamp_90khz)
{
    put_u32(output, left_length);
    put_u32(output + 4, right_length);
    put_u64(output + 8, presentation_timestamp_90khz);
}

void eos2_encode_chunk_footer(
    uint8_t output[EOS2_CHUNK_FOOTER_SIZE],
    uint32_t chunk_index,
    uint64_t first_sequence,
    uint64_t last_sequence,
    uint64_t data_bytes,
    const uint8_t sha256[32])
{
    put_u32(output, chunk_index);
    put_u64(output + 4, first_sequence);
    put_u64(output + 12, last_sequence);
    put_u64(output + 20, data_bytes);
    memcpy(output + 28, sha256, 32);
}
