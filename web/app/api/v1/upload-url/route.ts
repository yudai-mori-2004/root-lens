/**
 * 仕様書 §6.2 パイプラインB: データ保存
 *
 * POST /api/v1/upload-url
 *
 * R2公開バケットへのpresigned PUT URLを発行する。
 * アプリはこのURLを使ってR2に直接アップロードする。
 */

import { NextRequest, NextResponse } from "next/server";
import { createPresignedPutUrl, contentKey, ogpKey } from "@/lib/server/r2";

export async function POST(req: NextRequest) {
  try {
    const { contentHash, contentType, kind } = await req.json();

    if (!contentHash || !contentType) {
      return NextResponse.json(
        { error: "contentHash and contentType are required" },
        { status: 400 },
      );
    }

    const key = kind === "ogp" ? ogpKey(contentHash) : contentKey(contentHash);
    const uploadUrl = await createPresignedPutUrl(key, contentType);
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    return NextResponse.json({ uploadUrl, key, publicUrl });
  } catch (e: unknown) {
    console.error("[upload-url] Error:", e);
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
