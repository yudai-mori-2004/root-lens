#pragma once

#include <stddef.h>
#include <stdint.h>

#include "esp_h264_enc_dual.h"

typedef struct {
    uint8_t *left;
    uint8_t *right;
    size_t capacity_per_eye;
} ego_stereo_output_buffers_t;

typedef struct {
    size_t left_length;
    size_t right_length;
    uint32_t presentation_timestamp_90khz;
    esp_h264_frame_type_t left_frame_type;
    esp_h264_frame_type_t right_frame_type;
} ego_stereo_encoded_pair_t;

typedef struct {
    esp_h264_enc_dual_handle_t handle;
} ego_stereo_encoder_t;

esp_h264_err_t ego_stereo_encoder_open(ego_stereo_encoder_t *encoder);

esp_h264_err_t ego_stereo_encoder_process(
    ego_stereo_encoder_t *encoder,
    uint8_t *decoded_stereo,
    uint64_t sequence,
    const ego_stereo_output_buffers_t *buffers,
    ego_stereo_encoded_pair_t *encoded);

esp_h264_err_t ego_stereo_encoder_close(ego_stereo_encoder_t *encoder);

