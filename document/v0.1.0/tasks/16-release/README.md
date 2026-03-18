# Task 16: リリースビルドと公開

## Android リリースビルド

### 前提

- EAS CLI がインストール・ログイン済み (`npx eas whoami`)
- Google Play Console にアプリが登録済み（パッケージ名: `io.rootlens.app`）
- 署名キーストアが EAS に登録済み（`eas credentials` で管理）

### ネイティブライブラリのビルド

RootLens は c2pa-bridge (Rust) のネイティブ .so を含むため、
EAS のリモートビルドではなくローカルビルドを使用する。

```bash
# 1. Rust静的ライブラリのクロスコンパイル
NDK_TOOLCHAIN="$HOME/Library/Android/sdk/ndk/27.2.12479018/toolchains/llvm/prebuilt/darwin-x86_64"

cd native/c2pa-bridge
sed -i '' 's/crate-type = \["staticlib", "cdylib"\]/crate-type = ["staticlib"]/' Cargo.toml

CC_aarch64_linux_android="$NDK_TOOLCHAIN/bin/aarch64-linux-android35-clang" \
AR_aarch64_linux_android="$NDK_TOOLCHAIN/bin/llvm-ar" \
cargo build --release --target aarch64-linux-android

sed -i '' 's/crate-type = \["staticlib"\]/crate-type = ["staticlib", "cdylib"]/' Cargo.toml

# 2. JNI .so 生成
$NDK_TOOLCHAIN/bin/aarch64-linux-android35-clang \
  -shared -o /tmp/libc2pa_bridge.so \
  app/android/app/src/main/jni/c2pa_jni.c \
  -I native/c2pa-bridge/ \
  -Wl,--whole-archive \
  native/c2pa-bridge/target/aarch64-linux-android/release/libc2pa_bridge.a \
  -Wl,--no-whole-archive \
  -llog -lm -ldl

# 3. 配置
cp /tmp/libc2pa_bridge.so app/android/app/src/main/jniLibs/arm64-v8a/libc2pa_bridge.so
```

### Production AAB ビルド

```bash
cd app
npx eas build --platform android --profile production --local
```

出力: `build-*.aab` がカレントディレクトリに生成される。

### Google Play Console へのアップロード

1. [Google Play Console](https://play.google.com/console) にログイン
2. 「RootLens」アプリを選択（なければ新規作成）
3. 「リリース」→「本番」（または「内部テスト」）
4. 「新しいリリースを作成」
5. 生成された `.aab` ファイルをアップロード
6. リリースノートを記入
7. 審査に提出

### 内部テスト（推奨フロー）

本番公開前に内部テストトラックで配布するのが安全:

1. Google Play Console →「テスト」→「内部テスト」
2. テスターのメールアドレスを追加
3. AAB をアップロード → 即配布（審査なし）
4. テスターは Google Play の内部テストリンクからインストール
5. 問題なければ本番トラックに昇格

## iOS リリースビルド

### 前提

- Apple Developer Program ($99/年) に加入済み
- Xcode がインストール済み
- App Store Connect にアプリが登録済み

### ネイティブライブラリのビルド

```bash
# Rust iOS ターゲット追加
rustup target add aarch64-apple-ios aarch64-apple-ios-sim

# 静的ライブラリのビルド
cd native/c2pa-bridge
cargo build --release --target aarch64-apple-ios
```

### Production IPA ビルド

```bash
cd app
npx eas build --platform ios --profile production --local
```

### App Store Connect へのアップロード

```bash
# Transporter または xcrun でアップロード
xcrun altool --upload-app -f build-*.ipa -t ios -u YOUR_APPLE_ID -p APP_SPECIFIC_PASSWORD
```

## Web (rootlens.io)

Vercel で自動デプロイ済み。`git push` するだけ。

## バージョン管理

- `app.json` の `version` フィールド: ユーザーに見えるバージョン (例: "0.1.0")
- Android: `versionCode` は EAS が自動インクリメント
- iOS: `buildNumber` は EAS が自動インクリメント

バージョンを上げる場合:
```bash
# app.json の version を更新
# 例: "0.1.0" → "0.2.0"
```

## チェックリスト

- [ ] ネイティブ .so が最新のRustコードでビルドされている
- [ ] `app.json` の version が正しい
- [ ] EAS credentials (キーストア) が設定済み
- [ ] Production AAB ビルド成功
- [ ] 内部テストで動作確認
- [ ] Google Play Console にアップロード
- [ ] ストア掲載情報（スクリーンショット、説明文等）
- [ ] iOS: Apple Developer Program 加入
- [ ] iOS: Production IPA ビルド成功
- [ ] iOS: App Store Connect にアップロード
