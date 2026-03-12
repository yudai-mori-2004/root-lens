/**
 * 仕様書 §6.4 公開ページ生成・リンク発行
 *
 * POST /api/v1/pages — ページレコード作成
 */

import { NextRequest, NextResponse } from "next/server";
import { createPage } from "@/lib/server/page-store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { contentHash, assetId, thumbnailUrl, ogpImageUrl } = body;
    if (!contentHash || !assetId) {
      return NextResponse.json(
        { error: "contentHash and assetId are required" },
        { status: 400 }
      );
    }

    const record = await createPage({
      contentHash,
      assetId,
      thumbnailUrl: thumbnailUrl || "",
      ogpImageUrl: ogpImageUrl || "",
    });

    return NextResponse.json({
      shortId: record.shortId,
      pageUrl: `/p/${record.shortId}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
