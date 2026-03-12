/**
 * POST /api/v1/device-certificate/renew
 * 証明書更新API
 *
 * 既存のDevice Certificateの有効期限が近い場合（残り14日以内）に呼び出し。
 * 同じTEE鍵のCSR + 新しいPlatform Attestationで再検証し、
 * 新しい90日証明書を発行する。
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyCSR, issueDeviceCertificate } from "@/lib/server/ca";

const DEV_MODE = process.env.DEV_MODE !== "false";

interface RenewRequest {
  platform: "android" | "ios";
  csr: string; // Base64 DER（同じ公開鍵）
  attestation?: {
    key_attestation_chain?: string[];
    play_integrity_token?: string;
    app_attest_object?: string;
    app_attest_key_id?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: RenewRequest = await request.json();

    if (!body.platform || !body.csr) {
      return NextResponse.json(
        { error: "Missing required fields: platform, csr" },
        { status: 400 }
      );
    }

    // CSR検証
    const csrResult = await verifyCSR(body.csr);
    if (!csrResult.valid || !csrResult.publicKey) {
      return NextResponse.json(
        { error: csrResult.error || "CSR verification failed" },
        { status: 400 }
      );
    }

    // Platform Attestation 再検証（更新時にも再Attestationを要求）
    if (!DEV_MODE) {
      if (!body.attestation) {
        return NextResponse.json(
          { error: "Attestation required for certificate renewal" },
          { status: 400 }
        );
      }
      // TODO: Attestation検証（§4.4.2と同じロジック）
    }

    // 新しい90日証明書を発行（同じ公開鍵、新しいシリアルナンバー）
    // 旧証明書は失効させない（旧証明書で署名済みコンテンツの検証継続のため）
    const result = await issueDeviceCertificate(
      csrResult.publicKey,
      csrResult.deviceIdHash
    );

    return NextResponse.json({
      device_certificate: result.deviceCertDer,
      root_ca_certificate: result.rootCaCertDer,
      device_id: result.deviceId,
    });
  } catch (e) {
    console.error("Certificate renewal error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
