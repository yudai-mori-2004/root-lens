/**
 * 仕様書 §6.4 公開ページ生成・リンク発行
 *
 * GET  /api/v1/pages?address=xxx — 自分のコンテンツ一覧取得
 * POST /api/v1/pages — ページレコード作成
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPage } from "@/lib/server/page-store";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("pages")
    .select(`
      short_id,
      status,
      created_at,
      contents (
        content_hash,
        thumbnail_url,
        ogp_image_url
      )
    `)
    .eq("user_id", userId)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? []).map((p: any) => {
    const allContents = (p.contents ?? []).map((c: any) => ({
      contentHash: c.content_hash || "",
      thumbnailUrl: c.thumbnail_url || "",
    }));
    return {
      shortId: p.short_id,
      thumbnailUrl: allContents[0]?.thumbnailUrl || "",
      contentCount: allContents.length,
      createdAt: p.created_at,
    };
  });

  return NextResponse.json(items);
}

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
