# c2pa-bridge ビルドガイド

c2pa-rsライブラリの更新やネイティブモジュールの再ビルドが必要な場合の手順書。
AIエージェントがこのドキュメントを参照して再ビルドを実行できることを意図している。

## 前提環境

- macOS (Apple Silicon)
- Rust toolchain (`rustup`)
- Android SDK + NDK 27.x (`$HOME/Library/Android/sdk/`)
- Xcode + iOS SDK

## ファイル構成と依存関係

```
native/c2pa-bridge/
├── Cargo.toml              # c2pa-rs依存定義
├── src/lib.rs              # C FFI ラッパー (署名ロジック本体)
├── c2pa_bridge.h           # C header (JNI/Swift bridging headerから参照)
└── .cargo/config.toml      # Androidクロスコンパイル用リンカー設定

app/android/app/src/main/
├── jni/c2pa_jni.c          # JNI → C FFI ブリッジ
├── jniLibs/
│   ├── arm64-v8a/libc2pa_bridge.so   # 実機用 (aarch64)
│   └── x86_64/libc2pa_bridge.so      # x86_64エミュレーター用
├── assets/dev-certs/       # 開発用証明書 (chain + key)
└── java/io/rootlens/app/
    ├── C2paBridgeModule.kt     # React Nativeネイティブモジュール
    └── C2paBridgePackage.kt    # モジュール登録

app/dev-certs/              # 証明書マスター (gen-dev-certs.sh の出力先)
scripts/gen-dev-certs.sh    # 証明書生成スクリプト
```

## 1. Cargo.toml の feature 設定

```toml
[dependencies]
c2pa = { version = "0.78", default-features = false, features = ["rust_native_crypto"] }
```

**重要**: `rust_native_crypto` は必須。
- デフォルトfeatureはOpenSSLに依存するため、Android/iOSクロスコンパイルで失敗する
- `rust_native_crypto` は純粋Rust実装の暗号ライブラリを使うため依存問題がない
- ホストでのテスト時にデフォルト (OpenSSL) に切り替えて検証してもよいが、
  クロスコンパイル前に必ず `rust_native_crypto` に戻すこと

## 2. Android ビルド手順

### 2.1 Rustクロスコンパイルターゲット追加

```bash
rustup target add aarch64-linux-android x86_64-linux-android
```

### 2.2 .cargo/config.toml のリンカー設定

NDKのバージョンとパスを環境に合わせて設定する。
`darwin-x86_64` は Rosetta 経由で動作するので Apple Silicon でもこのパスで正しい。

```toml
[target.aarch64-linux-android]
linker = "$HOME/Library/Android/sdk/ndk/<VERSION>/toolchains/llvm/prebuilt/darwin-x86_64/bin/aarch64-linux-android<API>-clang"

[target.x86_64-linux-android]
linker = "$HOME/Library/Android/sdk/ndk/<VERSION>/toolchains/llvm/prebuilt/darwin-x86_64/bin/x86_64-linux-android<API>-clang"
```

現在の値: NDK `27.2.12479018`, API level `35`

**注意**: config.toml はシェル変数展開されないため、絶対パスで記述する。

### 2.3 Rust静的ライブラリのビルド

```bash
cd native/c2pa-bridge

# aarch64 (実機 + arm64エミュレーター)
cargo build --release --target aarch64-linux-android

# x86_64 (x86エミュレーター用。必要な場合のみ)
cargo build --release --target x86_64-linux-android
```

メモリ制約がある環境では `-j 1` を付ける。
出力先: `target/<target>/release/libc2pa_bridge.a`

### 2.4 JNI共有ライブラリ (.so) の生成

Rust の `.a` (静的ライブラリ) と JNI ブリッジ `.c` をリンクして `.so` を作る。

```bash
NDK_TOOLCHAIN="$HOME/Library/Android/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/darwin-x86_64"

# aarch64
$NDK_TOOLCHAIN/bin/aarch64-linux-android35-clang \
  -shared -o libc2pa_bridge.so \
  app/android/app/src/main/jni/c2pa_jni.c \
  -I native/c2pa-bridge/ \
  -Wl,--whole-archive \
  native/c2pa-bridge/target/aarch64-linux-android/release/libc2pa_bridge.a \
  -Wl,--no-whole-archive \
  -llog -lm -ldl

# x86_64 (同様にターゲットを変えるだけ)
$NDK_TOOLCHAIN/bin/x86_64-linux-android35-clang \
  -shared -o libc2pa_bridge_x86_64.so \
  app/android/app/src/main/jni/c2pa_jni.c \
  -I native/c2pa-bridge/ \
  -Wl,--whole-archive \
  native/c2pa-bridge/target/x86_64-linux-android/release/libc2pa_bridge.a \
  -Wl,--no-whole-archive \
  -llog -lm -ldl
```

**`--whole-archive` が必須**: これがないと `.a` 内のシンボルが省略され、
生成された `.so` が数KBの空ファイルになる（System.loadLibrary は成功するが関数が見つからない）。

### 2.5 .so の配置

```bash
cp libc2pa_bridge.so app/android/app/src/main/jniLibs/arm64-v8a/libc2pa_bridge.so
cp libc2pa_bridge_x86_64.so app/android/app/src/main/jniLibs/x86_64/libc2pa_bridge.so
```

### 2.6 証明書のコピー

```bash
cp app/dev-certs/dev-chain.pem app/android/app/src/main/assets/dev-certs/dev-chain.pem
cp app/dev-certs/dev-device-key.pem app/android/app/src/main/assets/dev-certs/dev-device-key.pem
```

### 2.7 APKビルド + インストール

```bash
cd app/android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 3. iOS ビルド手順

(Task 03 iOS完了後に追記)

### 3.1 Rustクロスコンパイルターゲット追加

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
```

### 3.2 静的ライブラリのビルド

```bash
cd native/c2pa-bridge
cargo build --release --target aarch64-apple-ios
cargo build --release --target aarch64-apple-ios-sim
```

### 3.3 Xcodeプロジェクトへの統合

(TODO: bridging header, .a リンク, Swift モジュール)

## 4. ホストでのテスト

ネイティブモジュールをビルドする前に、ホストマシンで署名ロジックをテストできる。

```bash
# テスト用JPEG生成（初回のみ）
sips -s format jpeg -z 100 100 \
  "/System/Library/Desktop Pictures/Solid Colors/Black.png" \
  --out /tmp/test_c2pa_input.jpg

# テスト実行
cd native/c2pa-bridge
cargo test -- --nocapture
```

テストは `app/dev-certs/` の証明書を参照する。
証明書を再生成した場合はテストも再実行して確認すること。

### ホスト検証 (c2patool)

```bash
# インストール
cargo install c2patool

# 検証（trust anchor なし → signingCredential.untrusted は出るが他は通るはず）
c2patool /tmp/test_c2pa_output.jpg

# 検証（trust anchor あり → 全て success になるはず）
c2patool /tmp/test_c2pa_output.jpg trust \
  --trust_anchors app/dev-certs/dev-root-ca.pem
```

期待される結果:
- `assertion.dataHash.match` → success
- `claimSignature.validated` → success
- `signingCredential.trusted` → success (trust anchor指定時)

## 5. c2pa-rs バージョン更新時の手順

1. `native/c2pa-bridge/Cargo.toml` のバージョンを更新
2. ホストでテスト (`cargo test`) → 署名・検証が通ることを確認
3. c2patoolも更新 (`cargo install c2patool`) → 検証が通ることを確認
4. Android用 `.so` を再ビルド (§2.3 〜 §2.5)
5. iOS用 `.a` を再ビルド (§3.2 〜 §3.3)
6. APK / アプリを再ビルドしてインストール・テスト

**注意点**:
- APIの破壊的変更がある場合は `src/lib.rs` の修正が必要
- 特に `Builder`, `create_signer::from_keys`, `SigningAlg` のAPIに注目
- `rust_native_crypto` featureの存在も確認すること（将来廃止される可能性）

## 6. 証明書再生成時の手順

1. `scripts/gen-dev-certs.sh` を実行
2. Android assets にコピー (§2.6)
3. iOS バンドルにコピー (TODO)
4. APK / アプリを再ビルド

**重要**: APPENDIX-c2pa-rs-cert-requirements.md の証明書プロファイル要件を参照。
特に Device Certificate の Subject DN に `O` (Organization) フィールドが必須。

## 7. トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| クロスコンパイルでOpenSSL関連エラー | `default-features = true` になっている | `rust_native_crypto` featureに戻す |
| `.so` が数KBしかない | `--whole-archive` なしでリンク | §2.4のリンクコマンドを確認 |
| `System.loadLibrary` 成功するが `nativeSignImage` が -2 | content:// URIをそのまま渡している | `resolveToFile()` で実パスに変換されているか確認 |
| `claimSignature.mismatch` | 証明書の `O` フィールドが欠けている | APPENDIX参照、証明書再生成 |
| `SIGKILL` during build | メモリ不足 | `cargo build -j 1` でジョブ数制限 |
| adb version mismatch | 別アプリが古いadbを起動している | `ps aux \| grep adb` で特定してkill |
