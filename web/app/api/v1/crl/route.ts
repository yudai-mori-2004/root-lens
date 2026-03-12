/**
 * GET /api/v1/crl
 * CRL（証明書失効リスト）エンドポイント
 * 仕様書 §4.7 鍵ライフサイクル管理
 *
 * 失効したDevice CertificateのシリアルナンバーリストをJSON形式で返却。
 * 公開ページの検証時にフェッチされる。
 */

import { NextResponse } from "next/server";
import { getRevokedSerials } from "@/lib/server/crl";

export async function GET() {
  const revoked = getRevokedSerials();

  return NextResponse.json({
    revoked_serials: revoked,
    updated_at: new Date().toISOString(),
  }, {
    headers: {
      // 公開ページからのCORS対応
      "Access-Control-Allow-Origin": "*",
      // 5分キャッシュ
      "Cache-Control": "public, max-age=300",
    },
  });
}
