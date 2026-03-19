package io.rootlens.app

import com.facebook.react.bridge.*
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import android.util.Base64
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.security.SecureRandom

/**
 * ネイティブ AES-256-GCM 暗号化/復号モジュール
 *
 * javax.crypto (Androidビルトイン) を使用。追加依存ゼロ。
 * ARMv8のAESハードウェア命令を自動利用。
 */
class AesGcmModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "AesGcmBridge"

    /**
     * バイナリペイロード構築 + AES-GCM暗号化をネイティブで一括実行。
     * 5MBのコンテンツがJS↔Native Bridgeを一切通過しない。
     *
     * plaintext: [4B meta_len][metadata][content_file_bytes]
     * output:    [32B eph_pk][12B nonce][ciphertext+tag]
     *
     * @param contentFilePath コンテンツファイルパス
     * @param metadataJson   メタデータJSON文字列 ({"owner_wallet":"..."})
     * @param symmetricKeyBase64 対称鍵 (32B Base64)
     * @param ephPubkeyBase64   エフェメラル公開鍵 (32B Base64)
     * @param outputFilePath 出力ファイルパス
     * @return { size: number } 出力ファイルサイズ
     */
    @ReactMethod
    fun buildAndEncryptPayload(
        contentFilePath: String,
        metadataJson: String,
        symmetricKeyBase64: String,
        ephPubkeyBase64: String,
        outputFilePath: String,
        promise: Promise
    ) {
        try {
            val key = Base64.decode(symmetricKeyBase64, Base64.NO_WRAP)
            val ephPk = Base64.decode(ephPubkeyBase64, Base64.NO_WRAP)
            val metaBytes = metadataJson.toByteArray(Charsets.UTF_8)
            val content = File(contentFilePath).readBytes()

            // plaintext: [4B meta_len BE][metadata][content]
            val metaLen = ByteBuffer.allocate(4).putInt(metaBytes.size).array()
            val plaintext = metaLen + metaBytes + content

            // AES-256-GCM
            val nonce = ByteArray(12).also { SecureRandom().nextBytes(it) }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
            val ciphertext = cipher.doFinal(plaintext)

            // wire: [32B eph_pk][12B nonce][ciphertext+tag]
            FileOutputStream(outputFilePath).use { out ->
                out.write(ephPk)
                out.write(nonce)
                out.write(ciphertext)
            }

            val result = Arguments.createMap()
            result.putInt("size", ephPk.size + nonce.size + ciphertext.size)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("BUILD_ENCRYPT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun encrypt(keyBase64: String, plaintextBase64: String, promise: Promise) {
        try {
            val key = Base64.decode(keyBase64, Base64.NO_WRAP)
            val plaintext = Base64.decode(plaintextBase64, Base64.NO_WRAP)

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"))

            val iv = cipher.iv
            val ciphertextWithTag = cipher.doFinal(plaintext)

            val result = Arguments.createMap()
            result.putString("nonce", Base64.encodeToString(iv, Base64.NO_WRAP))
            result.putString("ciphertext", Base64.encodeToString(ciphertextWithTag, Base64.NO_WRAP))
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("AES_ENCRYPT_ERROR", e.message, e)
        }
    }

    /** ファイルパス方式: 9.7MBがBridgeを通過しない */
    @ReactMethod
    fun encryptFile(inputPath: String, outputPath: String, keyBase64: String, promise: Promise) {
        try {
            val key = Base64.decode(keyBase64, Base64.NO_WRAP)
            val plaintext = File(inputPath).readBytes()

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"))
            val ciphertextWithTag = cipher.doFinal(plaintext)

            File(outputPath).outputStream().use { out ->
                out.write(ciphertextWithTag)
            }

            val result = Arguments.createMap()
            result.putString("nonce", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            result.putInt("size", ciphertextWithTag.size)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("AES_ENCRYPT_FILE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun decryptFile(inputPath: String, outputPath: String, keyBase64: String, nonceBase64: String, promise: Promise) {
        try {
            val key = Base64.decode(keyBase64, Base64.NO_WRAP)
            val nonce = Base64.decode(nonceBase64, Base64.NO_WRAP)
            val ciphertext = File(inputPath).readBytes()

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
            val plaintext = cipher.doFinal(ciphertext)

            File(outputPath).writeBytes(plaintext)
            promise.resolve(outputPath)
        } catch (e: Exception) {
            promise.reject("AES_DECRYPT_FILE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun decrypt(keyBase64: String, nonceBase64: String, ciphertextBase64: String, promise: Promise) {
        try {
            val key = Base64.decode(keyBase64, Base64.NO_WRAP)
            val nonce = Base64.decode(nonceBase64, Base64.NO_WRAP)
            val ciphertext = Base64.decode(ciphertextBase64, Base64.NO_WRAP)

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))

            val plaintext = cipher.doFinal(ciphertext)
            promise.resolve(Base64.encodeToString(plaintext, Base64.NO_WRAP))
        } catch (e: Exception) {
            promise.reject("AES_DECRYPT_ERROR", e.message, e)
        }
    }
}
