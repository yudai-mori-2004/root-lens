#include <arpa/inet.h>
#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <unistd.h>

#include "driver/sdspi_host.h"
#include "driver/spi_common.h"
#include "driver/uart.h"
#include "esp_check.h"
#include "esp_event.h"
#include "esp_h264_alloc.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_vfs_fat.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "linux/videodev2.h"
#include "psa/crypto.h"
#include "sdmmc_cmd.h"

#include "ego_capture_config.h"
#include "ego_stereo_layout.h"
#include "eos2_wire.h"
#include "example_v4l2.h"
#include "stereo_encoder.h"

#define STORAGE_ROOT "/sdcard"
#define WIFI_SSID "RootLens-Ego"
#define WIFI_PASSWORD "rootlens-ego-2026"
#define VIDEO_PAIRS_PER_CHUNK (EGO_CHUNK_SECONDS * EGO_FRAME_RATE)
#define FILE_BUFFER_BYTES (1024 * 1024)
#define UART_BATCH_BYTES 8192

static const char *TAG = "rootlens_ego";
static uint8_t *s_file_buffer;
static uint8_t s_uart_pending[UART_BATCH_BYTES];
static volatile bool s_stop_requested;
static volatile bool s_recording_active;

typedef struct {
    example_image_t decoded;
    uint64_t pair_index;
    int64_t capture_us;
    esp_err_t result;
    bool end;
} decoded_item_t;

typedef struct {
    FILE *file;
    uint32_t index;
    uint64_t first_sequence;
    uint64_t last_sequence;
    uint64_t data_bytes;
    uint32_t video_pairs;
    psa_hash_operation_t digest;
    char partial_path[64];
    char final_path[64];
} chunk_writer_t;

static esp_err_t write_all(FILE *file, const void *data, size_t length)
{
    return fwrite(data, 1, length, file) == length ? ESP_OK : ESP_FAIL;
}

static esp_err_t chunk_append_bytes(chunk_writer_t *writer, const void *data, size_t length)
{
    ESP_RETURN_ON_ERROR(write_all(writer->file, data, length), TAG, "microSD write failed");
    ESP_RETURN_ON_FALSE(psa_hash_update(&writer->digest, data, length) == PSA_SUCCESS,
                        ESP_FAIL, TAG, "SHA-256 update failed");
    writer->data_bytes += length;
    return ESP_OK;
}

static esp_err_t chunk_open(chunk_writer_t *writer, uint32_t index)
{
    memset(writer, 0, sizeof(*writer));
    writer->index = index;
    snprintf(writer->partial_path, sizeof(writer->partial_path), STORAGE_ROOT "/%06" PRIu32 ".eos2.partial", index);
    snprintf(writer->final_path, sizeof(writer->final_path), STORAGE_ROOT "/%06" PRIu32 ".eos2", index);
    writer->file = fopen(writer->partial_path, "wb");
    ESP_RETURN_ON_FALSE(writer->file, ESP_FAIL, TAG, "cannot open %s", writer->partial_path);
    ESP_RETURN_ON_FALSE(setvbuf(writer->file, (char *)s_file_buffer, _IOFBF, FILE_BUFFER_BYTES) == 0,
                        ESP_FAIL, TAG, "cannot set file buffer");
    writer->digest = psa_hash_operation_init();
    ESP_RETURN_ON_FALSE(psa_hash_setup(&writer->digest, PSA_ALG_SHA_256) == PSA_SUCCESS,
                        ESP_FAIL, TAG, "SHA-256 start failed");
    return ESP_OK;
}

static uint32_t next_available_chunk_index(void)
{
    struct stat information;
    for (uint32_t index = 0; index < UINT32_MAX; ++index) {
        char final_path[64];
        char partial_path[64];
        snprintf(final_path, sizeof(final_path), STORAGE_ROOT "/%06" PRIu32 ".eos2", index);
        snprintf(partial_path, sizeof(partial_path), STORAGE_ROOT "/%06" PRIu32 ".eos2.partial", index);
        if (stat(final_path, &information) != 0 && stat(partial_path, &information) != 0) return index;
    }
    return UINT32_MAX;
}

static esp_err_t chunk_append_record(
    chunk_writer_t *writer,
    eos2_record_type_t type,
    uint64_t sequence,
    int64_t capture_us,
    const void *payload,
    uint32_t payload_length)
{
    uint8_t header[EOS2_HEADER_SIZE];
    eos2_record_description_t description = {
        .type = type,
        .sequence = sequence,
        .capture_monotonic_us = (uint64_t)capture_us,
        .payload_length = payload_length,
        .payload_crc32 = eos2_crc32(payload, payload_length),
    };
    eos2_encode_header(header, &description);
    if (writer->data_bytes == 0) {
        writer->first_sequence = sequence;
    }
    writer->last_sequence = sequence;
    ESP_RETURN_ON_ERROR(chunk_append_bytes(writer, header, sizeof(header)), TAG, "header write failed");
    return chunk_append_bytes(writer, payload, payload_length);
}

static esp_err_t chunk_append_video(
    chunk_writer_t *writer,
    uint64_t record_sequence,
    int64_t capture_us,
    const ego_stereo_output_buffers_t *buffers,
    const ego_stereo_encoded_pair_t *encoded)
{
    uint8_t prefix[EOS2_VIDEO_PREFIX_SIZE];
    uint32_t payload_length = sizeof(prefix) + encoded->left_length + encoded->right_length;
    eos2_encode_video_prefix(prefix, (uint32_t)encoded->left_length, (uint32_t)encoded->right_length,
                             encoded->presentation_timestamp_90khz);

    uint8_t header[EOS2_HEADER_SIZE];
    eos2_record_description_t description = {
        .type = EOS2_VIDEO_PAIR,
        .sequence = record_sequence,
        .capture_monotonic_us = (uint64_t)capture_us,
        .payload_length = payload_length,
    };

    /* CRC covers the three payload spans without making a contiguous image copy. */
    uint32_t payload_crc = eos2_crc32_update(UINT32_MAX, prefix, sizeof(prefix));
    payload_crc = eos2_crc32_update(payload_crc, buffers->left, encoded->left_length);
    payload_crc = eos2_crc32_update(payload_crc, buffers->right, encoded->right_length);
    description.payload_crc32 = payload_crc ^ UINT32_MAX;
    eos2_encode_header(header, &description);
    if (writer->data_bytes == 0) {
        writer->first_sequence = record_sequence;
    }
    writer->last_sequence = record_sequence;
    ESP_RETURN_ON_ERROR(chunk_append_bytes(writer, header, sizeof(header)), TAG, "video header write failed");
    ESP_RETURN_ON_ERROR(chunk_append_bytes(writer, prefix, sizeof(prefix)), TAG, "video prefix write failed");
    ESP_RETURN_ON_ERROR(chunk_append_bytes(writer, buffers->left, encoded->left_length), TAG, "left video write failed");
    ESP_RETURN_ON_ERROR(chunk_append_bytes(writer, buffers->right, encoded->right_length), TAG, "right video write failed");
    writer->video_pairs++;
    return ESP_OK;
}

static esp_err_t chunk_close(chunk_writer_t *writer, uint64_t footer_sequence)
{
    uint8_t digest[32];
    size_t digest_length = 0;
    uint8_t payload[EOS2_CHUNK_FOOTER_SIZE];
    uint8_t header[EOS2_HEADER_SIZE];
    ESP_RETURN_ON_FALSE(psa_hash_finish(&writer->digest, digest, sizeof(digest),
                                        &digest_length) == PSA_SUCCESS &&
                            digest_length == sizeof(digest),
                        ESP_FAIL, TAG, "SHA-256 finish failed");
    eos2_encode_chunk_footer(payload, writer->index, writer->first_sequence,
                             writer->last_sequence, writer->data_bytes, digest);
    eos2_record_description_t description = {
        .type = EOS2_CHUNK_END,
        .sequence = footer_sequence,
        .capture_monotonic_us = (uint64_t)esp_timer_get_time(),
        .payload_length = sizeof(payload),
        .payload_crc32 = eos2_crc32(payload, sizeof(payload)),
    };
    eos2_encode_header(header, &description);
    ESP_RETURN_ON_ERROR(write_all(writer->file, header, sizeof(header)), TAG, "footer header write failed");
    ESP_RETURN_ON_ERROR(write_all(writer->file, payload, sizeof(payload)), TAG, "footer write failed");
    ESP_RETURN_ON_FALSE(fflush(writer->file) == 0 && fsync(fileno(writer->file)) == 0,
                        ESP_FAIL, TAG, "microSD flush failed");
    ESP_RETURN_ON_FALSE(fclose(writer->file) == 0, ESP_FAIL, TAG, "microSD close failed");
    writer->file = NULL;
    ESP_RETURN_ON_FALSE(rename(writer->partial_path, writer->final_path) == 0,
                        ESP_FAIL, TAG, "cannot finalize chunk");
    return ESP_OK;
}

static esp_err_t mount_storage(void)
{
    spi_bus_config_t bus = {
        .mosi_io_num = EGO_SD_MOSI_GPIO,
        .miso_io_num = EGO_SD_MISO_GPIO,
        .sclk_io_num = EGO_SD_CLOCK_GPIO,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = FILE_BUFFER_BYTES,
    };
    ESP_RETURN_ON_ERROR(spi_bus_initialize(SPI2_HOST, &bus, SPI_DMA_CH_AUTO), TAG, "SPI init failed");
    sdmmc_host_t host = SDSPI_HOST_DEFAULT();
    host.slot = SPI2_HOST;
    host.max_freq_khz = 40000;
    sdspi_device_config_t device = SDSPI_DEVICE_CONFIG_DEFAULT();
    device.host_id = SPI2_HOST;
    device.gpio_cs = EGO_SD_CHIP_SELECT_GPIO;
    esp_vfs_fat_sdmmc_mount_config_t mount = {
        .format_if_mount_failed = false,
        .max_files = 6,
        .allocation_unit_size = 1024 * 1024,
    };
    sdmmc_card_t *card = NULL;
    ESP_RETURN_ON_ERROR(esp_vfs_fat_sdspi_mount(STORAGE_ROOT, &host, &device, &mount, &card),
                        TAG, "microSD mount failed");
    return ESP_OK;
}

static esp_err_t start_sensor_uart(void)
{
    uart_config_t config = {
        .baud_rate = 921600,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };
    ESP_RETURN_ON_ERROR(uart_driver_install(UART_NUM_1, 32 * 1024, 0, 0, NULL, 0), TAG, "UART driver failed");
    ESP_RETURN_ON_ERROR(uart_param_config(UART_NUM_1, &config), TAG, "UART config failed");
    return uart_set_pin(UART_NUM_1, EGO_XIAO_UART_TX_GPIO, EGO_XIAO_UART_RX_GPIO,
                        UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
}

static void send_sensor_command(const char *command)
{
    ESP_ERROR_CHECK(uart_write_bytes(UART_NUM_1, command, strlen(command)) >= 0 ? ESP_OK : ESP_FAIL);
}

static bool contains_reply(const uint8_t *bytes, size_t length, const char *reply)
{
    size_t reply_length = strlen(reply);
    if (length < reply_length) return false;
    for (size_t offset = 0; offset <= length - reply_length; ++offset) {
        if (memcmp(bytes + offset, reply, reply_length) == 0) return true;
    }
    return false;
}

static esp_err_t send_sensor_command_and_wait(
    const char *command,
    const char *success_reply,
    uint8_t pending[UART_BATCH_BYTES],
    size_t *pending_length)
{
    size_t reply_start = *pending_length;
    send_sensor_command(command);
    int64_t deadline_us = esp_timer_get_time() + 2000000;
    while (esp_timer_get_time() < deadline_us) {
        ESP_RETURN_ON_FALSE(*pending_length < UART_BATCH_BYTES, ESP_ERR_NO_MEM,
                            TAG, "sensor startup transcript is full");
        int count = uart_read_bytes(UART_NUM_1, pending + *pending_length,
                                    UART_BATCH_BYTES - *pending_length,
                                    pdMS_TO_TICKS(20));
        if (count > 0) {
            *pending_length += (size_t)count;
            if (contains_reply(pending + reply_start, *pending_length - reply_start,
                               success_reply)) {
                return ESP_OK;
            }
        }
    }
    ESP_LOGE(TAG, "sensor command did not return %s: %s", success_reply, command);
    return ESP_ERR_TIMEOUT;
}

static esp_err_t start_oscar_sensor_sequence(
    uint8_t pending[UART_BATCH_BYTES], size_t *pending_length)
{
    ESP_RETURN_ON_ERROR(send_sensor_command_and_wait(
                            "W100;", "W1,OK;", pending, pending_length),
                        TAG, "sensor controller did not enter ready state");
    ESP_RETURN_ON_ERROR(send_sensor_command_and_wait(
                            "W101;", "W1,OK;", pending, pending_length),
                        TAG, "sensor controller did not enter recording state");
    ESP_RETURN_ON_ERROR(send_sensor_command_and_wait(
                            "I100,60,0;", "I1,OK;", pending, pending_length),
                        TAG, "exposure counter did not start");
    return send_sensor_command_and_wait(
        "G100,180;", "G1,OK;", pending, pending_length);
}

static esp_err_t start_access_point(void)
{
    ESP_RETURN_ON_ERROR(esp_netif_init(), TAG, "network init failed");
    esp_err_t event_result = esp_event_loop_create_default();
    ESP_RETURN_ON_FALSE(event_result == ESP_OK || event_result == ESP_ERR_INVALID_STATE,
                        event_result, TAG, "event loop failed");
    esp_netif_create_default_wifi_ap();
    wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
    ESP_RETURN_ON_ERROR(esp_wifi_init(&init), TAG, "Wi-Fi init failed");
    wifi_config_t access_point = {0};
    memcpy(access_point.ap.ssid, WIFI_SSID, sizeof(WIFI_SSID));
    memcpy(access_point.ap.password, WIFI_PASSWORD, sizeof(WIFI_PASSWORD));
    access_point.ap.ssid_len = strlen(WIFI_SSID);
    access_point.ap.channel = 6;
    access_point.ap.max_connection = 1;
    access_point.ap.authmode = WIFI_AUTH_WPA2_PSK;
    ESP_RETURN_ON_ERROR(esp_wifi_set_mode(WIFI_MODE_AP), TAG, "Wi-Fi mode failed");
    ESP_RETURN_ON_ERROR(esp_wifi_set_config(WIFI_IF_AP, &access_point), TAG, "access point config failed");
    return esp_wifi_start();
}

static bool receive_exact(int socket_fd, void *buffer, size_t length)
{
    uint8_t *bytes = buffer;
    while (length) {
        ssize_t count = recv(socket_fd, bytes, length, 0);
        if (count <= 0) return false;
        bytes += count;
        length -= (size_t)count;
    }
    return true;
}

static bool send_exact(int socket_fd, const void *buffer, size_t length)
{
    const uint8_t *bytes = buffer;
    while (length) {
        ssize_t count = send(socket_fd, bytes, length, 0);
        if (count <= 0) return false;
        bytes += count;
        length -= (size_t)count;
    }
    return true;
}

static bool highest_final_chunk_index(uint32_t *highest)
{
    DIR *directory = opendir(STORAGE_ROOT);
    if (!directory) return false;
    bool found = false;
    struct dirent *entry;
    while ((entry = readdir(directory)) != NULL) {
        if (strlen(entry->d_name) != 11 || strcmp(entry->d_name + 6, ".eos2") != 0) continue;
        bool six_digits = true;
        for (size_t i = 0; i < 6; ++i) {
            if (!isdigit((unsigned char)entry->d_name[i])) six_digits = false;
        }
        if (!six_digits) continue;
        uint32_t index = (uint32_t)strtoul(entry->d_name, NULL, 10);
        if (!found || index > *highest) *highest = index;
        found = true;
    }
    closedir(directory);
    return found;
}

static void serve_one_chunk(int socket_fd)
{
    uint8_t request[8];
    if (!receive_exact(socket_fd, request, sizeof(request))) return;
    if (memcmp(request, "STP2", 4) == 0) {
        s_stop_requested = true;
        while (s_recording_active) {
            vTaskDelay(pdMS_TO_TICKS(20));
        }
        send_exact(socket_fd, "DONE", 4);
        return;
    }
    if (memcmp(request, "LST2", 4) == 0) {
        if (s_recording_active) {
            send_exact(socket_fd, "BUSY", 4);
            return;
        }
        uint32_t highest = 0;
        if (!highest_final_chunk_index(&highest)) {
            send_exact(socket_fd, "EMPT", 4);
            return;
        }
        uint32_t network_highest = htonl(highest);
        if (send_exact(socket_fd, "LIST", 4)) {
            send_exact(socket_fd, &network_highest, sizeof(network_highest));
        }
        return;
    }
    if (memcmp(request, "GET2", 4) != 0) {
        send_exact(socket_fd, "FAIL", 4);
        return;
    }
    if (s_recording_active) {
        send_exact(socket_fd, "BUSY", 4);
        return;
    }
    uint32_t network_index;
    memcpy(&network_index, request + 4, sizeof(network_index));
    uint32_t index = ntohl(network_index);
    char path[64];
    snprintf(path, sizeof(path), STORAGE_ROOT "/%06" PRIu32 ".eos2", index);
    FILE *file = fopen(path, "rb");
    if (!file) {
        send_exact(socket_fd, "MISS", 4);
        return;
    }
    uint8_t *block = heap_caps_malloc(64 * 1024, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!block) {
        fclose(file);
        send_exact(socket_fd, "FAIL", 4);
        return;
    }
    if (!send_exact(socket_fd, "OKAY", 4)) goto done;
    size_t count;
    while ((count = fread(block, 1, 64 * 1024, file)) > 0) {
        if (!send_exact(socket_fd, block, count)) goto done;
    }
done:
    heap_caps_free(block);
    fclose(file);
}

static void chunk_server_task(void *unused)
{
    (void)unused;
    int server = socket(AF_INET, SOCK_STREAM, IPPROTO_IP);
    ESP_ERROR_CHECK(server < 0 ? ESP_FAIL : ESP_OK);
    int reuse = 1;
    setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &reuse, sizeof(reuse));
    struct sockaddr_in address = {
        .sin_family = AF_INET,
        .sin_port = htons(EGO_TCP_PORT),
        .sin_addr.s_addr = htonl(INADDR_ANY),
    };
    ESP_ERROR_CHECK(bind(server, (struct sockaddr *)&address, sizeof(address)) == 0 ? ESP_OK : ESP_FAIL);
    ESP_ERROR_CHECK(listen(server, 1) == 0 ? ESP_OK : ESP_FAIL);
    while (true) {
        int client = accept(server, NULL, NULL);
        if (client >= 0) {
            serve_one_chunk(client);
            shutdown(client, SHUT_RDWR);
            close(client);
        }
    }
}

static esp_err_t append_complete_uart_lines(
    chunk_writer_t *writer,
    uint64_t *record_sequence,
    uint8_t pending[UART_BATCH_BYTES],
    size_t *pending_length)
{
    int count = uart_read_bytes(UART_NUM_1, pending + *pending_length,
                                UART_BATCH_BYTES - *pending_length, 0);
    if (count > 0) *pending_length += (size_t)count;
    size_t complete = 0;
    for (size_t i = 0; i < *pending_length; ++i) {
        if (pending[i] == '\n') complete = i + 1;
    }
    if (!complete) return ESP_OK;
    ESP_RETURN_ON_ERROR(chunk_append_record(writer, EOS2_IMU_BATCH, (*record_sequence)++,
                                             esp_timer_get_time(), pending, (uint32_t)complete),
                        TAG, "IMU write failed");
    memmove(pending, pending + complete, *pending_length - complete);
    *pending_length -= complete;
    return ESP_OK;
}

static esp_err_t append_configuration_event(chunk_writer_t *writer, uint64_t *record_sequence)
{
    static const char configuration[] =
        "{\"event\":\"chunk_start\",\"firmware\":\"rootlens-ego-head-v0.1\","
        "\"oscar_commit\":\"d78d393a2772ed23ac7ebb57e4d1cdc60aa66cea\","
        "\"video\":{\"eyes\":2,\"width\":1280,\"height\":720,\"fps\":30,"
        "\"codec\":\"h264-baseline\",\"bitrate_per_eye\":6000000,\"gop\":60},"
        "\"imu_hz\":180,\"camera_input\":\"2560x720-mjpeg-yuv420\"}";
    return chunk_append_record(writer, EOS2_EVENT, (*record_sequence)++, esp_timer_get_time(),
                               configuration, sizeof(configuration) - 1);
}

static void capture_decode_task(void *argument)
{
    QueueHandle_t output_queue = (QueueHandle_t)argument;
    uint64_t pair_index = 0;
    esp_err_t result = ESP_OK;

    while (!s_stop_requested) {
        example_image_t jpeg = {0};
        decoded_item_t item = {
            .pair_index = pair_index,
            .result = ESP_OK,
        };
        result = camera_capture_image(&jpeg);
        item.capture_us = esp_timer_get_time();
        if (result == ESP_OK) {
            result = jpeg_decode(&jpeg, &item.decoded);
        }
        buffer_free(&jpeg);
        if (result == ESP_OK &&
            (item.decoded.width != EGO_STEREO_WIDTH ||
             item.decoded.height != EGO_FRAME_HEIGHT ||
             item.decoded.size < ego_stereo_decoded_bytes())) {
            result = ESP_ERR_INVALID_SIZE;
        }
        if (result != ESP_OK) {
            buffer_free(&item.decoded);
            break;
        }
        xQueueSend(output_queue, &item, portMAX_DELAY);
        pair_index++;
    }

    decoded_item_t terminal = {
        .result = result,
        .end = true,
    };
    xQueueSend(output_queue, &terminal, portMAX_DELAY);
    vTaskDelete(NULL);
}

void app_main(void)
{
    ESP_ERROR_CHECK(psa_crypto_init() == PSA_SUCCESS ? ESP_OK : ESP_FAIL);
    s_file_buffer = heap_caps_malloc(FILE_BUFFER_BYTES, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    ESP_ERROR_CHECK(s_file_buffer ? ESP_OK : ESP_ERR_NO_MEM);
    ESP_ERROR_CHECK(mount_storage());
    ESP_ERROR_CHECK(start_sensor_uart());
    ESP_ERROR_CHECK(start_access_point());
    xTaskCreate(chunk_server_task, "chunk_server", 6144, NULL, 5, NULL);

    example_camera_handle_t camera;
    example_jpeg_decoder_handle_t decoder;
    example_camera_config_t camera_config = {
        .width = EGO_STEREO_WIDTH,
        .height = EGO_FRAME_HEIGHT,
        .format = V4L2_PIX_FMT_MJPEG,
    };
    example_jpeg_config_t decoder_config = {
        .width = EGO_STEREO_WIDTH,
        .height = EGO_FRAME_HEIGHT,
        .input_format = V4L2_PIX_FMT_MJPEG,
    };
    ESP_ERROR_CHECK(open_camera(&camera_config, &camera));
    ESP_ERROR_CHECK(open_jpeg_decoder(&decoder_config, &decoder));
    ESP_ERROR_CHECK(camera_connect(camera, decoder));

    ego_stereo_encoder_t encoder;
    ESP_ERROR_CHECK(ego_stereo_encoder_open(&encoder) == ESP_H264_ERR_OK ? ESP_OK : ESP_FAIL);
    uint32_t left_capacity = EGO_H264_OUTPUT_CAPACITY;
    uint32_t right_capacity = EGO_H264_OUTPUT_CAPACITY;
    uint8_t *left = esp_h264_aligned_calloc(16, 1, left_capacity, &left_capacity, ESP_H264_MEM_SPIRAM);
    uint8_t *right = esp_h264_aligned_calloc(16, 1, right_capacity, &right_capacity, ESP_H264_MEM_SPIRAM);
    ESP_ERROR_CHECK(left && right ? ESP_OK : ESP_ERR_NO_MEM);
    ego_stereo_output_buffers_t outputs = {
        .left = left,
        .right = right,
        .capacity_per_eye = left_capacity < right_capacity ? left_capacity : right_capacity,
    };

    chunk_writer_t writer;
    uint32_t chunk_index = next_available_chunk_index();
    ESP_ERROR_CHECK(chunk_index != UINT32_MAX ? ESP_OK : ESP_ERR_NO_MEM);
    uint64_t record_sequence = 0;
    size_t uart_pending_length = 0;
    int64_t last_heartbeat_us = esp_timer_get_time();
    ESP_ERROR_CHECK(chunk_open(&writer, chunk_index));
    ESP_ERROR_CHECK(append_configuration_event(&writer, &record_sequence));
    ESP_ERROR_CHECK(start_oscar_sensor_sequence(s_uart_pending, &uart_pending_length));
    ESP_ERROR_CHECK(append_complete_uart_lines(&writer, &record_sequence,
                                               s_uart_pending, &uart_pending_length));
    QueueHandle_t decoded_queue = xQueueCreate(1, sizeof(decoded_item_t));
    ESP_ERROR_CHECK(decoded_queue ? ESP_OK : ESP_ERR_NO_MEM);
    s_recording_active = true;
    ESP_ERROR_CHECK(xTaskCreate(capture_decode_task, "capture_decode", 6144, decoded_queue,
                                8, NULL) == pdPASS ? ESP_OK : ESP_ERR_NO_MEM);

    esp_err_t recording_result = ESP_OK;
    while (true) {
        decoded_item_t item;
        xQueueReceive(decoded_queue, &item, portMAX_DELAY);
        if (item.end) {
            if (recording_result == ESP_OK) recording_result = item.result;
            break;
        }
        if (recording_result != ESP_OK) {
            buffer_free(&item.decoded);
            continue;
        }

        ego_stereo_encoded_pair_t encoded;
        esp_h264_err_t encode_result = ego_stereo_encoder_process(
            &encoder, item.decoded.data, item.pair_index, &outputs, &encoded);
        buffer_free(&item.decoded);
        if (encode_result != ESP_H264_ERR_OK) {
            recording_result = ESP_FAIL;
            s_stop_requested = true;
            continue;
        }
        recording_result = chunk_append_video(
            &writer, record_sequence++, item.capture_us, &outputs, &encoded);
        if (recording_result == ESP_OK) {
            recording_result = append_complete_uart_lines(
                &writer, &record_sequence, s_uart_pending, &uart_pending_length);
        }
        int64_t now_us = esp_timer_get_time();
        if (now_us - last_heartbeat_us >= 1000000) {
            send_sensor_command("I102;");
            last_heartbeat_us = now_us;
        }

        if (recording_result == ESP_OK && writer.video_pairs == VIDEO_PAIRS_PER_CHUNK) {
            recording_result = chunk_close(&writer, record_sequence++);
            if (recording_result == ESP_OK) {
                ESP_LOGI(TAG, "finalized chunk %06" PRIu32, chunk_index);
                recording_result = chunk_open(&writer, ++chunk_index);
            }
            if (recording_result == ESP_OK) {
                recording_result = append_configuration_event(&writer, &record_sequence);
            }
        }
        if (recording_result != ESP_OK) s_stop_requested = true;
    }
    vQueueDelete(decoded_queue);

    send_sensor_command("G101;");
    send_sensor_command("I101;");
    send_sensor_command(recording_result == ESP_OK ? "W102;" : "W110;");
    vTaskDelay(pdMS_TO_TICKS(250));
    if (writer.file) {
        esp_err_t uart_result = append_complete_uart_lines(
            &writer, &record_sequence, s_uart_pending, &uart_pending_length);
        if (recording_result == ESP_OK) recording_result = uart_result;
        esp_err_t close_result = chunk_close(&writer, record_sequence++);
        if (recording_result == ESP_OK) recording_result = close_result;
    }
    esp_h264_err_t encoder_close_result = ego_stereo_encoder_close(&encoder);
    if (recording_result == ESP_OK && encoder_close_result != ESP_H264_ERR_OK) {
        recording_result = ESP_FAIL;
    }
    esp_h264_free(left);
    esp_h264_free(right);
    close_jpeg_decoder(decoder);
    close_camera();
    s_recording_active = false;
    ESP_LOGI(TAG, "recording stopped; it is now safe to switch off power");
    ESP_ERROR_CHECK(recording_result);
}
