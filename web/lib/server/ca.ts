/**
 * Root CA + Intermediate CA 鍵管理 + Device Certificate 発行
 * 仕様書 §4.3, §4.4
 *
 * 3層PKI構造:
 *   Root CA → iOS/Android Intermediate CA → Device Certificate
 *
 * 環境変数:
 *   ROOT_CA_CERT_PEM / ROOT_CA_KEY_PEM — Root CA
 *   IOS_INTERMEDIATE_CA_CERT_PEM / IOS_INTERMEDIATE_CA_KEY_PEM — iOS Intermediate CA
 *   ANDROID_INTERMEDIATE_CA_CERT_PEM / ANDROID_INTERMEDIATE_CA_KEY_PEM — Android Intermediate CA
 *
 * ローカル開発時はファイルからフォールバック。
 */

import * as x509 from "@peculiar/x509";
import crypto from "crypto";

// @peculiar/x509 が使う Crypto プロバイダを設定（Node.js環境）
x509.cryptoProvider.set(crypto.webcrypto as Crypto);

// ---------------------------------------------------------------------------
// PEM 読み込みユーティリティ
// ---------------------------------------------------------------------------

function loadPem(envVar: string, fallbackPath?: string): string {
  const envValue = process.env[envVar];
  if (envValue) return envValue;
  if (fallbackPath) {
    const fs = require("fs");
    const path = require("path");
    const resolved = path.resolve(process.cwd(), fallbackPath);
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved, "utf-8");
    }
  }
  throw new Error(`${envVar} is not set and fallback not found`);
}

// ---------------------------------------------------------------------------
// Root CA
// ---------------------------------------------------------------------------

let rootCaCert: x509.X509Certificate | null = null;

async function loadRootCaCert(): Promise<x509.X509Certificate> {
  if (rootCaCert) return rootCaCert;
  const certPem = loadPem("ROOT_CA_CERT_PEM", "../certs/dev/root-ca.pem");
  rootCaCert = new x509.X509Certificate(certPem);
  return rootCaCert;
}

// ---------------------------------------------------------------------------
// Intermediate CAs (per-platform)
// ---------------------------------------------------------------------------

interface IntermediateCA {
  cert: x509.X509Certificate;
  key: CryptoKey;
}

const intermediateCache: Record<string, IntermediateCA> = {};

async function loadIntermediateCA(platform: "ios" | "android"): Promise<IntermediateCA> {
  if (intermediateCache[platform]) return intermediateCache[platform];

  const prefix = platform === "ios" ? "IOS" : "ANDROID";
  const certPem = loadPem(
    `${prefix}_INTERMEDIATE_CA_CERT_PEM`,
    `../certs/dev/${platform}-intermediate-ca.pem`,
  );
  const keyPem = loadPem(
    `${prefix}_INTERMEDIATE_CA_KEY_PEM`,
    `../certs/dev/${platform}-intermediate-ca-key.pem`,
  );

  const cert = new x509.X509Certificate(certPem);
  const keyDer = x509.PemConverter.decode(keyPem)[0];
  const key = await crypto.webcrypto.subtle.importKey(
    "pkcs8",
    keyDer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  intermediateCache[platform] = { cert, key };
  return intermediateCache[platform];
}

// ---------------------------------------------------------------------------
// CSR 検証
// ---------------------------------------------------------------------------

export async function verifyCSR(
  csrBase64: string,
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

// ---------------------------------------------------------------------------
// Device Certificate 発行（Intermediate CA で署名）
// ---------------------------------------------------------------------------

export async function issueDeviceCertificate(
  publicKey: CryptoKey,
  deviceIdHash: string,
  platform: "ios" | "android" = "android",
): Promise<{
  deviceCertDer: string;           // Base64 DER
  intermediateCaCertDer: string;   // Base64 DER
  rootCaCertDer: string;           // Base64 DER
  deviceId: string;
}> {
  const intermediateCa = await loadIntermediateCA(platform);
  const rootCa = await loadRootCaCert();

  // §4.3.2 Device Certificate プロファイル
  // 有効期限: 90日（短寿命証明書モデル）
  const now = new Date();
  const notAfter = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const deviceCert = await x509.X509CertificateGenerator.create({
    serialNumber: crypto.randomBytes(20).toString("hex"),
    subject: `CN=RootLens Device ${deviceIdHash}, O=RootLens`,
    issuer: intermediateCa.cert.subject,
    notBefore: now,
    notAfter: notAfter,
    signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
    publicKey: publicKey,
    signingKey: intermediateCa.key,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true), // CA:FALSE, critical
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.digitalSignature,
        true, // critical
      ),
      new x509.ExtendedKeyUsageExtension(
        ["1.3.6.1.5.5.7.3.36"], // id-kp-documentSigning
        false,
      ),
      await x509.SubjectKeyIdentifierExtension.create(publicKey),
      await x509.AuthorityKeyIdentifierExtension.create(intermediateCa.cert.publicKey),
    ],
  });

  return {
    deviceCertDer: Buffer.from(deviceCert.rawData).toString("base64"),
    intermediateCaCertDer: Buffer.from(intermediateCa.cert.rawData).toString("base64"),
    rootCaCertDer: Buffer.from(rootCa.rawData).toString("base64"),
    deviceId: deviceIdHash,
  };
}

// ---------------------------------------------------------------------------
// 公開情報
// ---------------------------------------------------------------------------

export async function getRootCaCertDer(): Promise<string> {
  const cert = await loadRootCaCert();
  return Buffer.from(cert.rawData).toString("base64");
}
