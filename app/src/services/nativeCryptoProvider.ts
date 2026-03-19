/**
 * ネイティブ AES-256-GCM CryptoProvider
 *
 * Android の javax.crypto を React Native ネイティブモジュール経由で使用。
 * 追加npm依存ゼロ。ARMv8のAESハードウェア命令を自動利用。
 */

import { NativeModules } from 'react-native';
import type { CryptoProvider } from '@title-protocol/sdk';

const { AesGcmBridge } = NativeModules;

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

function base64ToUint8Array(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const nativeCryptoProvider: CryptoProvider = {
  async encrypt(key: Uint8Array, plaintext: Uint8Array) {
    const result = await AesGcmBridge.encrypt(
      uint8ArrayToBase64(key),
      uint8ArrayToBase64(plaintext),
    );
    return {
      nonce: base64ToUint8Array(result.nonce),
      ciphertext: base64ToUint8Array(result.ciphertext),
    };
  },

  async decrypt(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array) {
    const resultBase64 = await AesGcmBridge.decrypt(
      uint8ArrayToBase64(key),
      uint8ArrayToBase64(nonce),
      uint8ArrayToBase64(ciphertext),
    );
    return base64ToUint8Array(resultBase64);
  },

  toBase64(bytes: Uint8Array): string {
    return uint8ArrayToBase64(bytes);
  },

  fromBase64(str: string): Uint8Array {
    return base64ToUint8Array(str);
  },
};
