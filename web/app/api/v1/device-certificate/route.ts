/**
 * POST /api/v1/device-certificate
 * 仕様書 §4.4.2 証明書発行API
 *
 * CSR + Platform Attestation を受け取り、Device Certificate を発行する。
 * Dev Mode: Attestation検証をスキップ（DEV_MODE=true）
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCSR, issueDeviceCertificate } from "@/lib/server/ca";

const DEV_MODE = process.env.DEV_MODE !== "false"; // デフォルトtrue

interface DeviceCertRequest {
  platform: "android" | "ios";
  csr: string; // Base64 DER
  attestation?: {
    // Android
    key_attestation_chain?: string[];
    play_integrity_token?: string;
    // iOS
    app_attest_object?: string;
    app_attest_key_id?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: DeviceCertRequest = await request.json();

    // 必須フィールド検証
    if (!body.platform || !body.csr) {
      return NextResponse.json(
        { error: "Missing required fields: platform, csr" },
        { status: 400 }
      );
    }

    if (body.platform !== "android" && body.platform !== "ios") {
      return NextResponse.json(
        { error: "Invalid platform. Must be 'android' or 'ios'" },
        { status: 400 }
      );
    }

    // CSR検証（Proof of Possession）
    const csrResult = await verifyCSR(body.csr);
    if (!csrResult.valid || !csrResult.publicKey) {
      return NextResponse.json(
        { error: csrResult.error || "CSR verification failed" },
        { status: 400 }
      );
    }

    // Platform Attestation 検証
    if (!DEV_MODE) {
      // TODO: 本番環境でのAttestation検証を実装
      // Android: Key Attestation chain + Play Integrity Token
      // iOS: App Attest CBOR + certificate chain
      if (!body.attestation) {
        return NextResponse.json(
          { error: "Attestation required in production mode" },
          { status: 400 }
        );
      }

      const attestationResult = await verifyAttestation(
        body.platform,
        body.csr,
        body.attestation
      );
      if (!attestationResult.valid) {
        return NextResponse.json(
          { error: attestationResult.error || "Attestation verification failed" },
          { status: 403 }
        );
      }
    }

    // Device Certificate 発行（プラットフォーム別 Intermediate CA で署名）
    const result = await issueDeviceCertificate(
      csrResult.publicKey,
      csrResult.deviceIdHash,
      body.platform,
    );

    return NextResponse.json({
      device_certificate: result.deviceCertDer,
      intermediate_ca_certificate: result.intermediateCaCertDer,
      root_ca_certificate: result.rootCaCertDer,
      device_id: result.deviceId,
    });
  } catch (e) {
    console.error("Certificate issuance error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// --- Platform Attestation 検証 (将来実装) ---

async function verifyAttestation(
  platform: "android" | "ios",
  csrBase64: string,
  attestation: NonNullable<DeviceCertRequest["attestation"]>
): Promise<{ valid: boolean; error?: string }> {
  // §4.4.2 サーバー側検証ロジック
  // challenge = SHA-256(CSR)
  if (platform === "android") {
    return verifyAndroidAttestation(csrBase64, attestation);
  } else {
    return verifyIOSAttestation(csrBase64, attestation);
  }
}

async function verifyAndroidAttestation(
  _csrBase64: string,
  _attestation: NonNullable<DeviceCertRequest["attestation"]>
): Promise<{ valid: boolean; error?: string }> {
  // TODO: §4.4.2 Android検証ロジック
  // 1. Key Attestation chain → Google Root CA検証
  // 2. attestationSecurityLevel >= TRUSTED_ENVIRONMENT(1)
  // 3. attestationChallenge == SHA-256(CSR)
  // 4. Play Integrity Token検証
  return { valid: false, error: "Android attestation not yet implemented" };
}

async function verifyIOSAttestation(
  _csrBase64: string,
  _attestation: NonNullable<DeviceCertRequest["attestation"]>
): Promise<{ valid: boolean; error?: string }> {
  // TODO: §4.4.2 iOS検証ロジック
  // 1. App Attest CBOR解析
  // 2. Apple Root CAまで検証
  // 3. clientDataHash == SHA-256(CSR)
  return { valid: false, error: "iOS attestation not yet implemented" };
}
