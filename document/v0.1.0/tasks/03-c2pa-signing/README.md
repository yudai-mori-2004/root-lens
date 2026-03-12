# Task 03: c2pa-rs FFI + 開発用証明書でC2PA署名付きコンテンツ生成

## 目的

c2pa-rsをiOS/Androidにクロスコンパイルし、ネイティブモジュール経由でReact Nativeから
C2PA署名付きJPEGを生成できるようにする。
開発用の自己署名証明書を使用し、TEE・Platform Attestation・サーバー連携はスコープ外とする。

## 仕様書参照

- §4.2 暗号アルゴリズム (ES256 / ECDSA P-256 with SHA-256)
- §4.3 PKI構造 (Root CA + Device Certificate) — 開発用証明書で代替
- §4.5 C2PAマニフェスト (COSE Sign1, x5chain)
- §4.6 C2PA SDK統合 (c2pa-rs FFI, ネイティブモジュールIF)

## 技術スタック

```
[React Native JS層]
  │  await signContent(imagePath)
  ▼
[ネイティブモジュール (Kotlin / Swift)]
  │  JNI / C bridging header
  ▼
[c2pa-c (C FFI バインディング)]
  │
  ▼
[c2pa-rs (static library)]
  → 署名済みJPEGを出力
```

## 実装内容

### Phase 1: 開発用証明書の生成 — COMPLETED

ローカルで以下を生成するスクリプトを作成:
- **Dev Root CA**: 自己署名のES256 (P-256) 証明書
  - Subject: `CN=RootLens Dev Root CA, O=RootLens Dev`
  - §4.3.1のプロファイルに準拠（pathLenConstraint:0等）
- **Dev Device Certificate**: Dev Root CAで署名
  - Subject: `CN=RootLens Device dev-0000, O=RootLens`
  - §4.3.2のプロファイルに準拠（EKU: id-kp-documentSigning等）
- **Dev秘密鍵**: ファイルベース（PKCS#8 PEM）。将来はTEE内に置き換え

出力先: `app/dev-certs/` (.gitignoreに追加)
生成スクリプト: `scripts/gen-dev-certs.sh` (openssl使用)

**注意**: Device Certificateには `O` (Organization) フィールドが必須。
c2pa-rs の検証コードが `iter_organization()` で参照するため、
CNのみの証明書では `claimSignature.mismatch` で検証失敗する。
詳細は `APPENDIX-c2pa-rs-cert-requirements.md` を参照。

### Phase 2: Rustクレート作成 + クロスコンパイル — COMPLETED

`native/c2pa-bridge/` にRustクレートを作成:
- c2pa-rsの `Builder` APIでマニフェスト構築
- 開発用秘密鍵でES256署名（ソフトウェア実装）
- x5chain に [Device Certificate, Root CA Certificate] を含める
- C FFI関数を公開: `c2pa_sign_image(input_path, output_path, cert_chain, private_key) -> result`

クロスコンパイルターゲット:
- Android: `aarch64-linux-android`, `x86_64-linux-android` (エミュレーター用)
- iOS: `aarch64-apple-ios`, `aarch64-apple-ios-sim`

**実装メモ**:
- `rust_native_crypto` featureでOpenSSL依存を回避（クロスコンパイルが容易）
- `.so`生成時は `--whole-archive` で静的ライブラリのシンボルを全て含める必要あり
- メモリ制約環境では `-j 1` でビルドジョブ数を制限

### Phase 3: ネイティブモジュール

**Android (Kotlin)** — COMPLETED:
- JNIでc2pa-bridgeの`.so`をロード
- React Nativeに`signContent(imagePath): Promise<signedPath>`を公開
- content:// URI → 実ファイルパスへの変換 (`resolveToFile()`)
- 署名済みJPEGをMediaLibraryに保存してギャラリーに表示
- c2patoolで検証: `claimSignature.validated` + `signingCredential.trusted` (trust anchor指定時) 確認済み

**iOS (Expo Modules API + Swift)** — COMPLETED:
- Expo Modules API (`ExpoModulesCore`) でネイティブモジュールを実装
- `modules/c2pa-bridge/` にローカルExpoモジュールとして配置
- modulemapでC FFI関数をSwiftに公開、podspecで`.a`をリンク
- `ph://` URI → Photos framework経由でキャッシュにコピー
- c2patoolで検証: `claimSignature.validated` + `signingCredential.trusted` 確認済み
- 注意: iOSのHEIC画像はc2pa-rsで署名不可（JPEG入力が必要）。RootLensカメラはJPEGで撮影するため問題なし

### Phase 4: JS層統合 — COMPLETED

- 撮影/選択 → 編集 → 証明ボタン時に`signContent`を呼び出す
- 署名済みJPEGをローカル保存 + ギャラリーに表示 (`expo-media-library`)
- 署名失敗時は未署名でフォールバック保存

## スコープ外（後続タスク）

- TEE内での鍵生成・署名（現時点はソフトウェア秘密鍵）
- CSR生成 + サーバーへの送信
- Platform Attestation (Android Key Attestation / iOS App Attest)
- サーバー側のDevice Certificate発行API
- タイムスタンプ (RFC 3161)
- 編集時のingredient + actionsアサーション（撮影時の署名のみ）
- 動画への署名

## ディレクトリ構成

```
RootLens/
├── scripts/
│   └── gen-dev-certs.sh
├── native/
│   └── c2pa-bridge/
│       ├── Cargo.toml
│       ├── src/
│       │   └── lib.rs        # C FFI + 署名ロジック
│       ├── c2pa_bridge.h     # C header
│       └── .cargo/config.toml # NDKリンカー設定
├── app/
│   ├── dev-certs/             (.gitignore)
│   ├── src/native/c2paBridge.ts  # JS wrapper
│   ├── android/app/src/main/
│   │   ├── java/.../C2paBridgeModule.kt
│   │   ├── java/.../C2paBridgePackage.kt
│   │   ├── jni/c2pa_jni.c
│   │   ├── jniLibs/{arm64-v8a,x86_64}/libc2pa_bridge.so
│   │   └── assets/dev-certs/
│   └── ios/RootLens/
│       └── (TODO) C2paBridgeModule.swift
```

## 完了条件

- [x] 開発用Root CA + Device Certificate生成スクリプトが動作する
- [x] c2pa-rsがAndroid (aarch64 + x86_64) にクロスコンパイルできる
- [x] c2pa-rsがiOS (aarch64 + sim) にクロスコンパイルできる
- [x] Androidで撮影した写真にC2PA署名を付与できる
- [x] iOSで撮影した写真にC2PA署名を付与できる
- [x] 署名済みJPEGをPC上のC2PA検証ツール (c2patool等) で検証してマニフェストが確認できる
- [x] 署名済みコンテンツがギャラリーに表示される

## リスク・懸念事項

- ~~c2pa-rsのAndroidクロスコンパイル: OpenSSLの依存関係が複雑な可能性~~ → `rust_native_crypto`で解決
- ~~c2pa-cのAPI安定性~~ → c2pa-rs 0.78の`Builder` + `create_signer::from_keys` APIで安定動作確認
- ~~Expo prebuildとネイティブモジュールの共存~~ → 手動でMainApplication.ktにPackage追加で対応
- ~~x86_64-linux-android (エミュレーター用) のビルドが通るか~~ → 通る（arm64エミュレーターなのでarm64を使用）
