#include "stereo_encoder.h"

#include <string.h>

#include "ego_capture_config.h"
#include "ego_stereo_layout.h"
#include "esp_h264_enc_dual_hw.h"
#include "esp_h264_enc_param_hw.h"

static esp_h264_enc_cfg_t eye_config(void)
{
    return (esp_h264_enc_cfg_t) {
        .pic_type = ESP_H264_RAW_FMT_O_UYY_E_VYY,
        .gop = EGO_H264_GOP,
        .fps = EGO_FRAME_RATE,
        .res = {
            .width = EGO_EYE_WIDTH,
            .height = EGO_FRAME_HEIGHT,
        },
        .rc = {
            .bitrate = EGO_H264_BITRATE_PER_EYE,
            .qp_min = EGO_H264_MIN_QP,
            .qp_max = EGO_H264_MAX_QP,
        },
    };
}

esp_h264_err_t ego_stereo_encoder_open(ego_stereo_encoder_t *encoder)
{
    if (!encoder) {
        return ESP_H264_ERR_ARG;
    }
    memset(encoder, 0, sizeof(*encoder));

    esp_h264_enc_cfg_dual_hw_t config = {
        .cfg0 = eye_config(),
        .cfg1 = eye_config(),
    };
    esp_h264_err_t result = esp_h264_enc_dual_hw_new(&config, &encoder->handle);
    if (result != ESP_H264_ERR_OK) {
        return result;
    }

    esp_h264_enc_param_hw_handle_t left_parameters = NULL;
    esp_h264_enc_param_hw_handle_t right_parameters = NULL;
    result = esp_h264_enc_dual_hw_get_param_hd0(encoder->handle, &left_parameters);
    if (result == ESP_H264_ERR_OK) {
        result = esp_h264_enc_dual_hw_get_param_hd1(encoder->handle, &right_parameters);
    }
    if (result == ESP_H264_ERR_OK) {
        result = esp_h264_enc_hw_set_input_stride_width(left_parameters, EGO_STEREO_WIDTH);
    }
    if (result == ESP_H264_ERR_OK) {
        result = esp_h264_enc_hw_set_input_stride_width(right_parameters, EGO_STEREO_WIDTH);
    }
    if (result == ESP_H264_ERR_OK) {
        result = esp_h264_enc_dual_open(encoder->handle);
    }
    if (result != ESP_H264_ERR_OK) {
        esp_h264_enc_dual_del(encoder->handle);
        encoder->handle = NULL;
    }
    return result;
}

esp_h264_err_t ego_stereo_encoder_process(
    ego_stereo_encoder_t *encoder,
    uint8_t *decoded_stereo,
    uint64_t sequence,
    const ego_stereo_output_buffers_t *buffers,
    ego_stereo_encoded_pair_t *encoded)
{
    if (!encoder || !encoder->handle || !decoded_stereo || !buffers || !encoded ||
        !buffers->left || !buffers->right || buffers->capacity_per_eye == 0) {
        return ESP_H264_ERR_ARG;
    }

    const uint32_t timestamp = (uint32_t)(sequence * (90000U / EGO_FRAME_RATE));
    const uint32_t source_span = (uint32_t)ego_eye_source_span_bytes();
    esp_h264_enc_in_frame_t left_input = {
        .raw_data = {.buffer = ego_left_eye(decoded_stereo), .len = source_span},
        .pts = timestamp,
    };
    esp_h264_enc_in_frame_t right_input = {
        .raw_data = {.buffer = ego_right_eye(decoded_stereo), .len = source_span},
        .pts = timestamp,
    };
    esp_h264_enc_out_frame_t left_output = {
        .raw_data = {.buffer = buffers->left, .len = buffers->capacity_per_eye},
    };
    esp_h264_enc_out_frame_t right_output = {
        .raw_data = {.buffer = buffers->right, .len = buffers->capacity_per_eye},
    };
    esp_h264_enc_in_frame_t *inputs[2] = {&left_input, &right_input};
    esp_h264_enc_out_frame_t *outputs[2] = {&left_output, &right_output};

    esp_h264_err_t result = esp_h264_enc_dual_process(encoder->handle, inputs, outputs);
    if (result != ESP_H264_ERR_OK) {
        return result;
    }
    if (left_output.pts != right_output.pts || left_output.frame_type != right_output.frame_type) {
        return ESP_H264_ERR_FAIL;
    }

    *encoded = (ego_stereo_encoded_pair_t) {
        .left_length = left_output.length,
        .right_length = right_output.length,
        .presentation_timestamp_90khz = left_output.pts,
        .left_frame_type = left_output.frame_type,
        .right_frame_type = right_output.frame_type,
    };
    return ESP_H264_ERR_OK;
}

esp_h264_err_t ego_stereo_encoder_close(ego_stereo_encoder_t *encoder)
{
    if (!encoder || !encoder->handle) {
        return ESP_H264_ERR_ARG;
    }
    esp_h264_err_t result = esp_h264_enc_dual_close(encoder->handle);
    esp_h264_err_t delete_result = esp_h264_enc_dual_del(encoder->handle);
    encoder->handle = NULL;
    return result == ESP_H264_ERR_OK ? delete_result : result;
}

