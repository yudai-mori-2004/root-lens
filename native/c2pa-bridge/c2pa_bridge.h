#ifndef C2PA_BRIDGE_H
#define C2PA_BRIDGE_H

#ifdef __cplusplus
extern "C" {
#endif

/**
 * C2PA署名を実行する
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
