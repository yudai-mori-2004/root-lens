#ifndef C2PA_BRIDGE_H
#define C2PA_BRIDGE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * TEE署名コールバック関数の型
 *
 * @param data          署名対象データ
 * @param data_len      dataの長さ
 * @param sig_out       署名出力バッファ（呼び出し側が確保）
 * @param sig_out_len   入力=バッファサイズ、出力=実際の署名サイズ
 * @param context       不透明コンテキストポインタ
 * @return 0: 成功, その他: エラー
 */
typedef int32_t (*c2pa_sign_fn)(
    const uint8_t *data,
    uint32_t data_len,
    uint8_t *sig_out,
    uint32_t *sig_out_len,
    void *context
);

/**
 * TEEコールバックを使用したC2PA署名（§4.6）
 *
 * 秘密鍵をRust側に渡さず、コールバック関数経由でTEE内で署名する。
 *
 * @param input_path    入力メディアファイルのパス (null-terminated UTF-8)
 * @param output_path   出力先パス (null-terminated UTF-8)
 * @param certs_der     DER証明書の連結バイト列 (Device Cert + Root CA)
 * @param cert_sizes    各証明書のサイズ配列
 * @param cert_count    証明書の数
 * @param sign_fn       TEE署名コールバック
 * @param sign_ctx      コールバック用コンテキスト
 * @param tsa_url       RFC 3161 TSAのURL（NULLの場合タイムスタンプなし）
 * @return 0: 成功, -1: 引数エラー, -2: 署名エラー, -3: その他
 */
int32_t c2pa_sign_image_tee(
    const char *input_path,
    const char *output_path,
    const uint8_t *certs_der,
    const uint32_t *cert_sizes,
    uint32_t cert_count,
    c2pa_sign_fn sign_fn,
    void *sign_ctx,
    const char *tsa_url
);

/**
 * C2PA署名を実行する（レガシー: PEMベースのソフトウェア署名）
 *
 * @param input_path   入力JPEG/PNGのパス (null-terminated UTF-8)
 * @param output_path  出力先パス (null-terminated UTF-8)
 * @param cert_chain_pem 証明書チェーン PEM (Device Cert + Root CA)
 * @param private_key_pem 秘密鍵 PEM (PKCS#8)
 * @return 0: 成功, -1: 引数エラー, -2: 署名エラー, -3: その他
 */
int c2pa_sign_image(
    const char *input_path,
    const char *output_path,
    const char *cert_chain_pem,
    const char *private_key_pem
);

/**
 * C2PAマニフェストを読み取る
 *
 * @param input_path 入力画像のパス (null-terminated UTF-8)
 * @return JSON文字列 (c2pa_free_stringで解放すること)。NULLの場合は致命的エラー。
 */
char *c2pa_read_manifest(const char *input_path);

/** バージョン文字列を返す。c2pa_free_stringで解放すること */
char *c2pa_get_version(void);

/** c2pa_free_stringで返された文字列を解放する */
void c2pa_free_string(char *s);

#ifdef __cplusplus
}
#endif

#endif /* C2PA_BRIDGE_H */
