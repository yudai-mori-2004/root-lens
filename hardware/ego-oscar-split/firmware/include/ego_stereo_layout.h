#pragma once

#include <stddef.h>
#include <stdint.h>

#include "ego_capture_config.h"

/*
 * ESP32-P4 hardware JPEG output and H.264 input use the packed YUV 4:2:0
 * representation named ESP_H264_RAW_FMT_O_UYY_E_VYY by Espressif. Every two
 * pixels occupy three bytes, so the right eye begins 1280 * 3 / 2 bytes after
 * the left eye on each decoded row.
 */
static inline size_t ego_yuv420_packed_row_bytes(size_t width)
{
    return width * 3U / 2U;
}

static inline size_t ego_stereo_decoded_bytes(void)
{
    return ego_yuv420_packed_row_bytes(EGO_STEREO_WIDTH) * EGO_FRAME_HEIGHT;
}

static inline size_t ego_right_eye_offset_bytes(void)
{
    return ego_yuv420_packed_row_bytes(EGO_EYE_WIDTH);
}

/* Bytes touched from either eye pointer when the DMA source stride is 2560. */
static inline size_t ego_eye_source_span_bytes(void)
{
    return ego_yuv420_packed_row_bytes(
        (size_t)(EGO_FRAME_HEIGHT - 1) * EGO_STEREO_WIDTH + EGO_EYE_WIDTH);
}

static inline uint8_t *ego_left_eye(uint8_t *decoded_stereo)
{
    return decoded_stereo;
}

static inline uint8_t *ego_right_eye(uint8_t *decoded_stereo)
{
    return decoded_stereo + ego_right_eye_offset_bytes();
}

_Static_assert(EGO_STEREO_WIDTH == 2 * EGO_EYE_WIDTH,
               "the source must contain two equally sized horizontal views");
_Static_assert((EGO_STEREO_WIDTH % 16) == 0 && (EGO_EYE_WIDTH % 16) == 0 &&
                   (EGO_FRAME_HEIGHT % 16) == 0,
               "hardware H.264 dimensions must be macroblock aligned");

