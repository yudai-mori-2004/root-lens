/**
 * Root CA 鍵管理 + Device Certificate 発行
 * 仕様書 §4.3, §4.4
 *
 * Dev環境: ファイルシステムからPEMを読み込み
 * Prod環境: AWS KMS Sign API（将来実装）
 */

import * as x509 from "@peculiar/x509";
import { readFileSync } from "fs";
import { resolve } from "path";
import crypto from "crypto";

// @peculiar/x509 が使う Crypto プロバイダを設定（Node.js環境）
x509.cryptoProvider.set(crypto.webcrypto as Crypto);

// --- Root CA 読み込み ---

const DEV_CERTS_DIR = resolve(process.cwd(), "..", "certs", "dev");

let rootCaCert: x509.X509Certificate | null = null;
let rootCaKey: CryptoKey | null = null;

async function loadRootCa() {
  if (rootCaCert && rootCaKey) return { cert: rootCaCert, key: rootCaKey };

  const certPem = readFileSync(resolve(DEV_CERTS_DIR, "root-ca.pem"), "utf-8");
  const keyPem = readFileSync(
    resolve(DEV_CERTS_DIR, "root-ca-key.pem"),
    "utf-8"
  );

  rootCaCert = new x509.X509Certificate(certPem);

  // PEMからECDSA秘密鍵をインポート
  const keyDer = x509.PemConverter.decode(keyPem)[0];
  rootCaKey = await crypto.webcrypto.subtle.importKey(
    "pkcs8",
    keyDer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  return { cert: rootCaCert, key: rootCaKey };
}

// --- CSR 検証 ---

export async function verifyCSR(
  csrBase64: string
): Promise<{
  valid: boolean;
  publicKey: CryptoKey | null;
  deviceIdHash: string;
  error?: string;
}> {
  try {
    const csrDer = Buffer.from(csrBase64, "base64");
    const csr = new x509.Pkcs10CertificateRequest(csrDer);

    // CSR自己署名検証（Proof of Possession）
    const valid = await csr.verify();
    if (!valid) {
      return { valid: false, publicKey: null, deviceIdHash: "", error: "CSR signature verification failed" };
    }

    // 公開鍵を取得
    const publicKey = await csr.publicKey.export();

    // device_id_hash = SHA-256(公開鍵DER)の先頭16文字hex
    const publicKeyDer = await crypto.webcrypto.subtle.exportKey("spki", publicKey);
    const hash = crypto.createHash("sha256").update(Buffer.from(publicKeyDer)).digest("hex");
    const deviceIdHash = hash.substring(0, 16);

    return { valid: true, publicKey, deviceIdHash };
  } catch (e) {
    return {
      valid: false,
      publicKey: null,
      deviceIdHash: "",
      error: `CSR parse error: ${e}`,
    };
  }
}

// --- Device Certificate 発行 ---

export async function issueDeviceCertificate(
  publicKey: CryptoKey,
  deviceIdHash: string
): Promise<{
  deviceCertDer: string; // Base64 DER
  rootCaCertDer: string; // Base64 DER
  deviceId: string;
}> {
  const { cert: caCert, key: caKey } = await loadRootCa();

  // §4.3.2 Device Certificate プロファイル
  // 有効期限: 90日（短寿命証明書モデル）
  const now = new Date();
  const notAfter = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const deviceCert = await x509.X509CertificateGenerator.create({
    serialNumber: crypto.randomBytes(20).toString("hex"),
    subject: `CN=RootLens Device ${deviceIdHash}, O=RootLens`,
    issuer: caCert.subject,
    notBefore: now,
    notAfter: notAfter,
    signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
    publicKey: publicKey,
    signingKey: caKey,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true), // CA:FALSE, critical
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.digitalSignature,
        true // critical
      ),
      new x509.ExtendedKeyUsageExtension(
        ["1.3.6.1.5.5.7.3.36"], // id-kp-documentSigning
        false
      ),
      await x509.SubjectKeyIdentifierExtension.create(publicKey),
      await x509.AuthorityKeyIdentifierExtension.create(caCert.publicKey),
    ],
  });

  return {
    deviceCertDer: Buffer.from(deviceCert.rawData).toString("base64"),
    rootCaCertDer: Buffer.from(caCert.rawData).toString("base64"),
    deviceId: deviceIdHash,
  };
}

// --- Root CA 証明書の公開情報 ---

export async function getRootCaCertDer(): Promise<string> {
  const { cert } = await loadRootCa();
  return Buffer.from(cert.rawData).toString("base64");
}
