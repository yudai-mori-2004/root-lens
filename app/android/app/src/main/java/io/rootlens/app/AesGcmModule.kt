package io.rootlens.app

import com.facebook.react.bridge.*
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import android.util.Base64

/**
 * ネイティブ AES-256-GCM 暗号化/復号モジュール
 *
 * javax.crypto (Androidビルトイン) を使用。追加依存ゼロ。
 * ARMv8のAESハードウェア命令を自動利用。
 */
class AesGcmModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "AesGcmBridge"

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
