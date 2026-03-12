/// c2pa-bridge: C2PA署名のC FFIラッパー
/// 仕様書 §4.6 C2PA SDK統合
///
/// React Native → ネイティブモジュール(Kotlin/Swift) → C FFI → c2pa-rs
///
/// 開発用: ソフトウェア秘密鍵で署名。将来はTEEコールバックに置き換え。

use std::ffi::{CStr, CString};
use std::fs;
use std::os::raw::c_char;

/// ファイル拡張子からMIMEタイプを推定する
/// c2pa-rsのBuilder::signに渡すフォーマット識別に使用
fn mime_from_path(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".heic") {
        "image/heic"
    } else if lower.ends_with(".heif") {
        "image/heif"
    } else if lower.ends_with(".avif") {
        "image/avif"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".tif") || lower.ends_with(".tiff") {
        "image/tiff"
    } else if lower.ends_with(".mp4") || lower.ends_with(".m4v") {
        "video/mp4"
    } else if lower.ends_with(".mov") {
        "video/quicktime"
    } else if lower.ends_with(".avi") {
        "video/avi"
    } else if lower.ends_with(".wav") {
        "audio/wav"
    } else if lower.ends_with(".mp3") {
        "audio/mpeg"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else {
        // フォールバック: JPEG として扱う
        "image/jpeg"
    }
}

/// C2PA署名を実行する
///
/// # Arguments
/// * `input_path` - 入力メディアファイルのパス (null-terminated UTF-8)
/// * `output_path` - 出力先パス (null-terminated UTF-8)
/// * `cert_chain_pem` - 証明書チェーン PEM (Device Cert + Root CA)
/// * `private_key_pem` - 秘密鍵 PEM
///
/// # Returns
/// * 0: 成功
/// * -1: 引数エラー
/// * -2: 署名エラー
/// * -3: その他のエラー
#[no_mangle]
pub extern "C" fn c2pa_sign_image(
    input_path: *const c_char,
    output_path: *const c_char,
    cert_chain_pem: *const c_char,
    private_key_pem: *const c_char,
) -> i32 {
    let result = std::panic::catch_unwind(|| {
        sign_image_inner(input_path, output_path, cert_chain_pem, private_key_pem)
    });
    match result {
        Ok(r) => r,
        Err(_) => -3,
    }
}

fn sign_image_inner(
    input_path: *const c_char,
    output_path: *const c_char,
    cert_chain_pem: *const c_char,
    private_key_pem: *const c_char,
) -> i32 {
    // パラメータの安全な変換
    let input = match unsafe_cstr_to_str(input_path) {
        Some(s) => s,
        None => return -1,
    };
    let output = match unsafe_cstr_to_str(output_path) {
        Some(s) => s,
        None => return -1,
    };
    let cert_pem = match unsafe_cstr_to_str(cert_chain_pem) {
        Some(s) => s,
        None => return -1,
    };
    let key_pem = match unsafe_cstr_to_str(private_key_pem) {
        Some(s) => s,
        None => return -1,
    };

    match do_sign(&input, &output, &cert_pem, &key_pem) {
        Ok(()) => 0,
        Err(e) => {
            eprintln!("c2pa_sign_image error: {e}");
            -2
        }
    }
}

fn unsafe_cstr_to_str(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    unsafe { CStr::from_ptr(ptr) }
        .to_str()
        .ok()
        .map(|s| s.to_owned())
}

fn do_sign(
    input_path: &str,
    output_path: &str,
    cert_chain_pem: &str,
    private_key_pem: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    use c2pa::{Builder, SigningAlg, create_signer};

    // 仕様書 §4.5 C2PAマニフェスト
    // - c2pa.created アクション
    // - claim_generator: RootLens
    let manifest_json = r#"{
        "claim_generator_info": [
            {
                "name": "RootLens",
                "version": "0.1.0"
            }
        ],
        "assertions": [
            {
                "label": "c2pa.actions",
                "data": {
                    "actions": [
                        {
                            "action": "c2pa.created",
                            "softwareAgent": {
                                "name": "RootLens",
                                "version": "0.1.0"
                            }
                        }
                    ]
                }
            }
        ]
    }"#;

    let mut builder = Builder::from_json(manifest_json)?;

    // 仕様書 §4.2: ES256 (ECDSA P-256 with SHA-256)
    let signer = create_signer::from_keys(
        cert_chain_pem.as_bytes(),
        private_key_pem.as_bytes(),
        SigningAlg::Es256,
        None, // タイムスタンプなし（§4.5.3: オフライン時はなし）
    )?;

    let mut source = fs::File::open(input_path)?;
    // BMFF (MP4/MOV) 署名ではc2pa-rsが出力ファイルを読み書き両方するため
    // create() (write-only) ではなく read+write で開く
    let mut dest = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(true)
        .open(output_path)?;

    let mime = mime_from_path(input_path);
    builder.sign(signer.as_ref(), mime, &mut source, &mut dest)?;

    Ok(())
}

/// C2PAマニフェストを読み取る
///
/// # Arguments
/// * `input_path` - 入力画像のパス (null-terminated UTF-8)
///
/// # Returns
/// * JSON文字列のポインタ (c2pa_free_stringで解放すること)
/// * NULL: 致命的エラー
///
/// 返却JSON:
/// - has_manifest: bool
/// - is_valid: bool (暗号検証に致命的失敗がないか。mismatch系がなければtrue)
/// - signer_common_name: string (署名者のCN)
/// - signer_org: string (署名者のO)
/// - claim_generator: string
/// - validation_status: array (検証結果。untrustedは想定内)
#[no_mangle]
pub extern "C" fn c2pa_read_manifest(
    input_path: *const c_char,
) -> *mut c_char {
    let result = std::panic::catch_unwind(|| {
        read_manifest_inner(input_path)
    });
    let json = match result {
        Ok(s) => s,
        Err(_) => r#"{"has_manifest":false,"error":"panic"}"#.to_string(),
    };
    CString::new(json)
        .map(|cs| cs.into_raw())
        .unwrap_or(std::ptr::null_mut())
}

fn read_manifest_inner(input_path: *const c_char) -> String {
    let input = match unsafe_cstr_to_str(input_path) {
        Some(s) => s,
        None => return r#"{"has_manifest":false,"error":"invalid input path"}"#.to_string(),
    };

    match do_read_manifest(&input) {
        Ok(json) => json,
        Err(e) => {
            eprintln!("c2pa_read_manifest error: {e}");
            let err_msg = format!("{e}").replace('\\', "\\\\").replace('"', "\\\"");
            format!(r#"{{"has_manifest":false,"error":"{}"}}"#, err_msg)
        }
    }
}

fn do_read_manifest(input_path: &str) -> Result<String, Box<dyn std::error::Error>> {
    use c2pa::Reader;
    use std::io::Cursor;

    let data = fs::read(input_path)?;

    let format = mime_from_path(input_path);

    let reader = match Reader::from_stream(format, Cursor::new(data)) {
        Ok(r) => r,
        Err(e) => {
            let err_str = format!("{e}");
            // JumbfNotFound = ファイルにC2PAマニフェストがない
            if err_str.contains("Jumbf")
                || err_str.contains("not found")
                || err_str.contains("No JUMBF")
            {
                return Ok(r#"{"has_manifest":false}"#.to_string());
            }
            return Err(e.into());
        }
    };

    // Reader::json() でフルマニフェストJSONを取得してパース
    let json_str = reader.json();
    let raw: serde_json::Value = serde_json::from_str(&json_str)?;

    // アクティブマニフェストから情報を抽出
    let active_label = raw
        .get("active_manifest")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let manifest = raw
        .get("manifests")
        .and_then(|m| m.get(active_label));

    let (claim_generator, signer_cn, signer_org) = match manifest {
        Some(m) => {
            // claim_generator_info は配列: [{"name": "RootLens", "version": "0.1.0", ...}]
            let cg = m
                .get("claim_generator_info")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|info| info.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("");

            let sig_info = m.get("signature_info");

            // common_name は signature_info 直下のフィールド
            let cn = sig_info
                .and_then(|si| si.get("common_name"))
                .and_then(|v| v.as_str())
                .unwrap_or("");

            // issuer は署名証明書の発行者CAの O (Organization) が入っている
            // Dev: "RootLens Dev", Prod: "RootLens"
            // TODO: 署名証明書自体のsubject Oを取得するように改善する
            let org = sig_info
                .and_then(|si| si.get("issuer"))
                .and_then(|v| v.as_str())
                .unwrap_or("");

            (cg.to_string(), cn.to_string(), org.to_string())
        }
        None => (String::new(), String::new(), String::new()),
    };

    let validation_status = raw
        .get("validation_status")
        .cloned()
        .unwrap_or(serde_json::Value::Array(vec![]));

    // 暗号検証の判定: mismatch/failure 系のコードがあれば検証失敗
    // signingCredential.untrusted はtrust anchor未設定時に出るため無視する（自前で信頼判定する）
    let is_valid = validation_status
        .as_array()
        .map(|arr| {
            !arr.iter().any(|entry| {
                let code = entry.get("code").and_then(|v| v.as_str()).unwrap_or("");
                code.contains("mismatch") || code.contains("failure")
            })
        })
        .unwrap_or(false);

    let result = serde_json::json!({
        "has_manifest": true,
        "is_valid": is_valid,
        "signer_common_name": signer_cn,
        "signer_org": signer_org,
        "claim_generator": claim_generator,
        "validation_status": validation_status
    });

    Ok(result.to_string())
}

/// バージョン文字列を返す
///
/// 返されたポインタは呼び出し側で `c2pa_free_string` で解放すること。
#[no_mangle]
pub extern "C" fn c2pa_get_version() -> *mut c_char {
    let version = format!("c2pa-bridge {}, c2pa-rs {}", env!("CARGO_PKG_VERSION"), "0.78");
    CString::new(version).unwrap().into_raw()
}

/// `c2pa_get_version` で返された文字列を解放する
#[no_mangle]
pub extern "C" fn c2pa_free_string(s: *mut c_char) {
    if !s.is_null() {
        unsafe {
            let _ = CString::from_raw(s);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sign_jpeg() {
        let cert_chain = fs::read_to_string(
            concat!(env!("CARGO_MANIFEST_DIR"), "/../../app/dev-certs/dev-chain.pem"),
        )
        .expect("dev-chain.pem not found. Run scripts/gen-dev-certs.sh first.");

        let private_key = fs::read_to_string(
            concat!(env!("CARGO_MANIFEST_DIR"), "/../../app/dev-certs/dev-device-key.pem"),
        )
        .expect("dev-device-key.pem not found");

        let input = "/tmp/test_c2pa_input.jpg";
        let output = "/tmp/test_c2pa_output.jpg";

        assert!(
            std::path::Path::new(input).exists(),
            "テスト用JPEGが必要: sips -s format jpeg -z 100 100 \"/System/Library/Desktop Pictures/Solid Colors/Black.png\" --out {input}"
        );

        let result = do_sign(input, output, &cert_chain, &private_key);
        match &result {
            Ok(()) => println!("署名成功"),
            Err(e) => println!("署名エラー: {e}"),
        }
        assert!(result.is_ok(), "署名に失敗: {:?}", result.err());

        let out_meta = fs::metadata(output).unwrap();
        let in_meta = fs::metadata(input).unwrap();
        assert!(
            out_meta.len() > in_meta.len(),
            "出力ファイルが入力より大きいはず（C2PAマニフェスト分）"
        );

        println!(
            "入力: {} bytes, 出力: {} bytes",
            in_meta.len(),
            out_meta.len()
        );
    }
}
