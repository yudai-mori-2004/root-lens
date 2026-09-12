#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include "eos2_wire.h"

static uint32_t read_u32(const uint8_t *input)
{
    return ((uint32_t)input[0] << 24) | ((uint32_t)input[1] << 16) |
           ((uint32_t)input[2] << 8) | input[3];
}

int main(void)
{
    assert(eos2_crc32("123456789", 9) == UINT32_C(0xCBF43926));
    uint32_t split_crc = eos2_crc32_update(UINT32_MAX, "1234", 4);
    split_crc = eos2_crc32_update(split_crc, "56789", 5) ^ UINT32_MAX;
    assert(split_crc == UINT32_C(0xCBF43926));

    const char payload[] = "abc";
    eos2_record_description_t description = {
        .type = EOS2_EVENT,
        .flags = 5,
        .sequence = 7,
        .capture_monotonic_us = 11,
        .payload_length = 3,
        .payload_crc32 = eos2_crc32(payload, 3),
    };
    uint8_t header[EOS2_HEADER_SIZE];
    eos2_encode_header(header, &description);
    assert(memcmp(header, "EOS2", 4) == 0);
    assert(header[5] == EOS2_VERSION);
    assert(header[7] == EOS2_EVENT);
    assert(read_u32(header + 8) == 5);
    assert(read_u32(header + 28) == 3);
    assert(read_u32(header + 32) == eos2_crc32(payload, 3));
    assert(read_u32(header + 36) == eos2_crc32(header, 36));
    puts("EOS2 wire format: ok");
    return 0;
}
