# Task 01: RFC 3161 TSAタイムスタンプ修正

## 目的

C2PA署名時にRFC 3161タイムスタンプが埋め込まれていなかった問題を修正する。
TSAタイムスタンプはコンテンツの撮影時刻を第三者機関が証明するものであり、
Title Protocolの公開ページで「いつ撮影されたか」の信頼性に直結する。

## 仕様書参照

- §4.5.3 RFC 3161 TSAタイムスタンプ（短期証明書には必須）
- §7.2 公開ページの表示内容（タイムスタンプ表示）

## 問題

### 症状

- 公開済みコンテンツの signed_json (CorePayload) に `tsa_timestamp`, `tsa_pubkey_hash`, `tsa_token_data` が全て欠落
- c2patool でC2PA署名済みファイルを検査すると `signature_info` に `time_stamp` フィールドがない
- アプリ上では署名が成功しており、エラーは発生していない

### 調査経路

1. **公開ページのデータ確認**: DAS API → Arweave signed_json を直接取得し、TSAフィールドの欠落を確認
2. **C2PAファイル検査**: `c2patool` で署名済みJPEGを検査 → タイムスタンプなし
3. **アプリ側コード確認**: Kotlin/Swift → JNI → Rust の全層でTSA URL (`http://timestamp.digicert.com`) が正しく渡されていることを確認
4. **TP TEE側確認**: `crates/core/src/tsa.rs` でCOSE署名の `sigTst2`/`sigTst` ヘッダからTSAトークンを抽出する実装が存在 → C2PA側にトークンがなければ抽出しようがない
5. **TSAエンドポイント確認**: ホストマシンから `openssl ts -query` + `curl` でHTTP 200 + 正常レスポンスを確認 → エンドポイント自体は正常
6. **c2pa-rs コードトレース**: `Signer::time_authority_url()` → `send_timestamp_request()` → `add_sigtst_header()` の呼び出しチェーンを追跡
7. **Android実機ログ**: `__android_log_write` でlogcat出力を追加し、各関数の呼び出しと引数をトレース

### ログによる切り分け

#### 第1回ログ（デフォルト `send_timestamp_request` 使用時）

```
time_authority_url() called, returning: Some("http://timestamp.digicert.com")
time_authority_url() called, returning: Some("http://timestamp.digicert.com")
builder.sign() completed successfully
```

- `time_authority_url()` は2回呼ばれ、正しいURLを返している
- `send_timestamp_request()` のログが出ない → デフォルト実装が呼ばれているが、内部でサイレントに失敗している
- 署名は成功 → TSAなしでも署名は通る仕様

#### 第2回ログ（ureq直接実装に切り替え後）

```
send_timestamp_request called, msg_len=1076
send_timestamp_request: POST http://timestamp.digicert.com body_len=66
send_timestamp_request: HTTP 200 OK
send_timestamp_request: got 6005 bytes
builder.sign() completed successfully
```

- ureqで直接POSTすると HTTP 200 + 6005バイトのレスポンスを正常取得
- c2pa-rsがこのバイト列を COSE `sigTst2` ヘッダに正しく埋め込み

### 根本原因

c2pa-rs 0.78.0 の `Signer` トレイトのデフォルト `send_timestamp_request` 実装は、
内部の HTTP リゾルバ (`SyncGenericResolver` → `ureq::Agent`) 経由で TSA にリクエストするが、
Android aarch64 クロスコンパイル環境ではレスポンスが正しく伝搬されない。

具体的には、`c2pa` クレートの `Signer::send_timestamp_request` が返す
`Option<c2pa::Result<Vec<u8>>>` が、`cose_sign.rs` の `SignerWrapper` を経由して
`c2pa-crypto` の `TimeStampProvider::send_time_stamp_request` に変換される際に、
レスポンスが `None` として扱われている可能性がある（2つのクレート間の
型変換・トレイト委譲の過程で消失）。

TSAエンドポイント自体は正常であり、ureqのHTTPクライアントもAndroid上で問題なく動作する。
問題は c2pa-rs 内部のトレイト委譲チェーンにある。

## 修正内容

### `native/c2pa-bridge/src/lib.rs`

`CallbackSigner` に `send_timestamp_request` のオーバーライドを追加。
c2pa-rs のデフォルト実装を使わず、ureq で直接 RFC 3161 リクエストを送信する。

```rust
fn send_timestamp_request(&self, message: &[u8]) -> Option<c2pa::Result<Vec<u8>>> {
    let url = self.time_authority_url()?;
    let body = self.timestamp_request_body(message).ok()?;

    match ureq::post(&url)
        .header("Content-Type", "application/timestamp-query")
        .send(&body[..])
    {
        Ok(resp) => { /* HTTP 200 → Some(Ok(bytes)), else → Some(Err(...)) */ }
        Err(e) => Some(Err(...))
    }
}
```

- `timestamp_request_body()` はc2pa-rsのデフォルト実装をそのまま使用（RFC 3161 TimeStampReq のDERエンコード）
- レスポンスの生バイト列（TimeStampResp）をそのまま返す
- c2pa-rs がこれを COSE unprotected header の `sigTst2` に埋め込む

### `native/c2pa-bridge/Cargo.toml`

`ureq = "3"` を直接依存に追加（c2pa経由でも入っているが、明示的に使用するため）。

### ビルド手順

`document/v0.1.0/tasks/03-c2pa-signing/BUILD-GUIDE.md` の §2.3〜§2.5 に従う。

```bash
# §2.3 Rust静的ライブラリのビルド
cd native/c2pa-bridge
CC_aarch64_linux_android="$NDK_TOOLCHAIN/bin/aarch64-linux-android35-clang" \
AR_aarch64_linux_android="$NDK_TOOLCHAIN/bin/llvm-ar" \
cargo build --release --target aarch64-linux-android

# §2.4 JNI .so 生成（-llog が必要）
$NDK_TOOLCHAIN/bin/aarch64-linux-android35-clang \
  -shared -o libc2pa_bridge.so \
  app/android/app/src/main/jni/c2pa_jni.c \
  -I native/c2pa-bridge/ \
  -Wl,--whole-archive \
  native/c2pa-bridge/target/aarch64-linux-android/release/libc2pa_bridge.a \
  -Wl,--no-whole-archive \
  -llog -lm -ldl

# §2.5 配置
cp libc2pa_bridge.so app/android/app/src/main/jniLibs/arm64-v8a/
```

**注意**: `ring` クレートのクロスコンパイルに `CC_aarch64_linux_android` と `AR_aarch64_linux_android` 環境変数が必要。BUILD-GUIDE にはリンカー設定のみ記載されているが、CC/AR も設定すること。

### BUILD-GUIDE への追記事項

§2.3 に以下を追記すべき:

```bash
# ring クレートのクロスコンパイルに CC と AR が必要
export CC_aarch64_linux_android="$NDK_TOOLCHAIN/bin/aarch64-linux-android35-clang"
export AR_aarch64_linux_android="$NDK_TOOLCHAIN/bin/llvm-ar"
```

`Cargo.toml` に `cdylib` が含まれている場合、クロスコンパイル時に `.so` のリンクが失敗する。
一時的に `crate-type = ["staticlib"]` に変更してビルドし、完了後に戻すこと。

## 検証

1. 撮影 → C2PA署名 → `c2patool` で `signature_info.time_stamp` の存在を確認
2. Title Protocol登録 → signed_json の `tsa_timestamp`, `tsa_pubkey_hash`, `tsa_token_data` の存在を確認
3. 公開ページで日付表示が「TSA認証時刻」と表示されることを確認

## 完了チェック

- [x] 問題の特定とログによる切り分け
- [x] `send_timestamp_request` オーバーライド実装
- [x] デバッグログの除去
- [x] Android arm64 .so リビルド
- [ ] 実機テスト: C2PAファイルにTSAタイムスタンプが含まれることを確認
- [ ] 実機テスト: Title Protocol登録後、signed_jsonにTSAフィールドが含まれることを確認
- [ ] 実機テスト: 公開ページで「TSA認証時刻」が表示されることを確認
- [ ] iOS対応（同じ問題が発生する場合）
- [ ] x86_64エミュレーター用 .so のリビルド（必要な場合）
- [ ] BUILD-GUIDE §2.3 に CC/AR 環境変数の記載を追記
