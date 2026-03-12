# 付録: c2pa-rs 証明書要件と claimSignature.mismatch の原因

## 問題

c2pa-rs 0.78 で `create_signer::from_keys()` + `Builder::sign()` で署名したJPEGを検証すると、
`assertion.dataHash.match` (データハッシュ) は成功するのに `claimSignature.mismatch` で検証失敗する。

`rust_native_crypto` / デフォルト (OpenSSL) 両方のfeatureで同一の結果。

## 原因

c2pa-rs の検証コード (`crypto/cose/verifier.rs:159-166`) がエンドエンティティ証明書の
**Subject DN の `O` (Organization) フィールド**を必須で参照している:

```rust
let subject = sign_cert
    .subject()
    .iter_organization()   // O= フィールドを探す
    .map(|attr| attr.as_str())
    .last()
    .ok_or(CoseError::MissingSigningCertificateChain)?  // なければエラー
```

`CN` しか設定していない証明書では、暗号的には正しい署名であっても
メタデータ抽出段階で `Err` → `claimSignature.mismatch` として報告される。

## 修正

エンドエンティティ証明書 (Device Certificate) の Subject DN に `O` フィールドを追加する。

```ini
# 修正前
[req_dn]
CN = RootLens Device dev-0000

# 修正後
[req_dn]
CN = RootLens Device dev-0000
O = RootLens
```

## 検証結果

修正前:
```
"validation_state": "Invalid"
failure: claimSignature.mismatch - claim signature is not valid
```

修正後:
```
"validation_state": "Trusted"
success: claimSignature.validated
success: signingCredential.trusted
success: assertion.dataHash.match
```

## c2pa-rs が要求する証明書プロファイルまとめ

| 項目 | 要件 | 根拠 |
|------|------|------|
| Subject DN に `O` | **必須** | `verifier.rs` が `iter_organization()` で抽出 |
| Basic Constraints | `CA:FALSE` | エンドエンティティ証明書であること |
| Key Usage | `digitalSignature` | 署名用途 |
| Extended Key Usage | `1.3.6.1.5.5.7.3.36` (id-kp-documentSigning) | `certificate_profile.rs` の許可リスト |
| 署名アルゴリズム | ES256 (ECDSA P-256 + SHA-256) | C2PA仕様 §8.1 |
| 秘密鍵フォーマット | PKCS#8 (`BEGIN PRIVATE KEY`) | `create_signer::from_keys()` が要求 |
| チェーン順序 | Device Cert → Root CA | `X509::stack_from_pem()` の解析順 |
| 自己署名 | 不可（別CAからの発行が必要） | チェーン検証で失敗する |

## 環境

- c2pa-rs: 0.78.0
- c2patool: 0.26.35
- 確認日: 2026-03-12
