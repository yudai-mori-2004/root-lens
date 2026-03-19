# Task 18: ネイティブ AES-256-GCM 暗号化

## 目的

Title Protocol SDKの暗号化処理をモバイルネイティブで実行し、登録パイプラインを高速化する。

## 背景

SDKのデフォルト CryptoProvider は Web Crypto API (`crypto.subtle`) を使用。
Hermesでは JS polyfill となり、9.7MBの暗号化に約20秒かかっていた。

## Phase 1: Base64ブリッジ方式（完了）

javax.crypto AES/GCM/NoPadding をネイティブモジュールとして公開。
JS↔ネイティブ間はBase64文字列で往復。

- `AesGcmModule.kt` — 50行
- `AesGcmPackage.kt` — 10行
- `MainApplication.kt` — 1行追加
- `nativeCryptoProvider.ts` — CryptoProvider実装
- `titleProtocol.ts` — `{ crypto: nativeCryptoProvider }`

**結果:** 20秒 → 3.7秒（暗号化単体）。ただしBase64変換がJSスレッドで約3秒かかる。

## Phase 2: ファイルパス方式（実装予定）

React NativeのLegacy Bridgeでは `byte[]` / `ArrayBuffer` を直接渡せないため、
Base64変換がボトルネック。ファイルパス経由でバイナリを受け渡すことで回避する。

### 設計

SDKの CryptoProvider インターフェースは変更しない。
`nativeCryptoProvider.ts` の内部実装のみ変更。

1. JS: plaintext (Uint8Array) を一時ファイルに書き出し
2. JS → Native: ファイルパス + 鍵(32byte Base64) のみBridge経由で渡す
3. Native: ファイルを直接読み → javax.crypto で暗号化 → 結果をファイルに書き出し
4. Native → JS: nonce(12byte Base64) + 出力ファイルパスを返す
5. JS: 出力ファイルを読み取り → Uint8Array として CryptoProvider に返す

9.7MBのデータがJS↔ネイティブBridgeを一切通過しない。
Bridgeを流れるのは鍵(32byte)とnonce(12byte)とファイルパス文字列のみ。

### AesGcmModule.kt 追加メソッド

```kotlin
@ReactMethod
fun encryptFile(inputPath: String, outputPath: String, keyBase64: String, promise: Promise) {
    val key = Base64.decode(keyBase64, Base64.NO_WRAP)
    val plaintext = File(inputPath).readBytes()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"))
    val ciphertextWithTag = cipher.doFinal(plaintext)
    // IV(12) + ciphertext + tag(16) をファイルに書き出し
    File(outputPath).outputStream().use { out ->
        out.write(cipher.iv)
        out.write(ciphertextWithTag)
    }
    val result = Arguments.createMap()
    result.putString("nonce", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
    result.putInt("size", cipher.iv.size + ciphertextWithTag.size)
    promise.resolve(result)
}

@ReactMethod
fun decryptFile(inputPath: String, outputPath: String, keyBase64: String, nonceBase64: String, promise: Promise) {
    val key = Base64.decode(keyBase64, Base64.NO_WRAP)
    val nonce = Base64.decode(nonceBase64, Base64.NO_WRAP)
    val ciphertext = File(inputPath).readBytes()
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
    val plaintext = cipher.doFinal(ciphertext)
    File(outputPath).writeBytes(plaintext)
    promise.resolve(outputPath)
}
```

### nativeCryptoProvider.ts 変更

```typescript
async encrypt(key: Uint8Array, plaintext: Uint8Array) {
  const inputPath = `${cacheDir}aes_in_${Date.now()}.bin`;
  const outputPath = `${cacheDir}aes_out_${Date.now()}.bin`;
  // plaintextをファイルに書き出し（FileSystem.writeAsStringAsync + Base64）
  await FileSystem.writeAsStringAsync(inputPath, uint8ArrayToBase64(plaintext), {
    encoding: FileSystem.EncodingType.Base64,
  });
  // ネイティブ暗号化（ファイル→ファイル）
  const result = await AesGcmBridge.encryptFile(inputPath, outputPath, uint8ArrayToBase64(key));
  // 結果をファイルから読み取り
  const ciphertextBase64 = await FileSystem.readAsStringAsync(outputPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  // cleanup
  await FileSystem.deleteAsync(inputPath, { idempotent: true });
  await FileSystem.deleteAsync(outputPath, { idempotent: true });
  return {
    nonce: base64ToUint8Array(result.nonce),
    ciphertext: base64ToUint8Array(ciphertextBase64),
  };
}
```

### 期待される効果

- encrypt: 3.7s → 数百ms（Base64変換がファイルI/Oに置換、ネイティブAES自体は数十ms）
- 全体: 15s → 12s程度

### iOS対応

同じファイルパス方式で CryptoKit を使用。Bridge名を共通にすることで
`nativeCryptoProvider.ts` は変更不要。

## 完了チェック

### Phase 1
- [x] AesGcmModule.kt（Base64方式）
- [x] nativeCryptoProvider.ts
- [x] 実機テスト: 20s → 3.7s

### Phase 2
- [ ] AesGcmModule.kt に encryptFile/decryptFile 追加
- [ ] nativeCryptoProvider.ts をファイルパス方式に変更
- [ ] 実機テスト: 3.7s → 数百ms（encrypt単体）
- [ ] iOS: Swift encryptFile/decryptFile 実装
