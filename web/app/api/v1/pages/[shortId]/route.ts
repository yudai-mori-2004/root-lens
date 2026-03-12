/**
 * 仕様書 §7.1 URL構造
 *
 * GET /api/v1/pages/:shortId — shortId からページメタデータを解決
 */

import { NextRequest, NextResponse } from "next/server";
import { findByShortId } from "@/lib/server/page-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ shortId: string }> }
) {
  const { shortId } = await params;
  const record = await findByShortId(shortId);

  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    contentHash: record.contentHash,
    assetId: record.assetId,
    thumbnailUrl: record.thumbnailUrl,
    ogpImageUrl: record.ogpImageUrl,
  });
}
