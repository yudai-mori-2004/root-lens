/**
 * 仕様書 §6.2, §6.4
 *
 * POST /api/v1/publish
 *
 * パイプラインB: ページ生成
 * アプリ側で画像処理・R2アップロードは完了済み。
 * サーバーはメタデータを受け取り、Supabaseにページレコードを作成する。
 *
 * Title Protocol登録はアプリ側で並列実行される (§6.1)
 */

import { NextRequest, NextResponse } from "next/server";
import { createPage } from "@/lib/server/page-store";

export async function POST(req: NextRequest) {
  try {
    const { contentHash, thumbnailUrl, ogpImageUrl } = await req.json();

    if (!contentHash || !thumbnailUrl) {
      return NextResponse.json(
        { error: "contentHash and thumbnailUrl are required" },
        { status: 400 },
      );
    }

    // Supabase ページ作成（contentHash/assetId はアプリからのPATCHで後から設定）
    const record = await createPage({
      contentHash,
      assetId: "",
      thumbnailUrl,
      ogpImageUrl: ogpImageUrl || thumbnailUrl,
    });

    const baseUrl = process.env.PUBLIC_PAGE_URL || "https://www.rootlens.io";
    const pageUrl = `${baseUrl}/p/${record.shortId}`;

    return NextResponse.json({
      shortId: record.shortId,
      pageUrl,
      contentHash,
    });
  } catch (e: unknown) {
    console.error("[publish] Error:", e);
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
