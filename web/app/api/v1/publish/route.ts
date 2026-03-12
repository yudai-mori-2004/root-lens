/**
 * 仕様書 §6.2, §6.4
 *
 * POST /api/v1/publish
 *
 * パイプラインB: データ保存 + ページ生成
 * 1. 表示用画像をリサイズして R2 にアップロード (§6.2)
 * 2. Supabase にページレコード作成 (§6.4)
 * 3. shortId + pageUrl を返却
 *
 * Title Protocol登録はアプリ側で並列実行される (§6.1)
 */

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { uploadPublic, contentKey, ogpKey } from "@/lib/server/r2";
import { createPage } from "@/lib/server/page-store";
import { createHash } from "node:crypto";
// Title Protocol登録はアプリ側で実行（§6.1）— サーバーは不要

// Vercel function timeout
export const maxDuration = 60;

/** 表示用画像の最大幅 */
const DISPLAY_MAX_WIDTH = 1600;
/** OGP画像の幅 */
const OGP_WIDTH = 1200;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("content") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "content file is required" },
        { status: 400 },
      );
    }

    const originalBytes = new Uint8Array(await file.arrayBuffer());

    // content_hash をSHA-256で計算（TP登録結果のPATCHで上書きされる）
    const hash = createHash("sha256").update(originalBytes).digest("hex");

    // 画像リサイズ + R2アップロード
    const [displayBuffer, ogpBuffer] = await Promise.all([
      sharp(originalBytes)
        .resize({ width: DISPLAY_MAX_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer(),
      sharp(originalBytes)
        .resize({ width: OGP_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer(),
    ]);

    const [thumbnailUrl, ogpImageUrl] = await Promise.all([
      uploadPublic(contentKey(hash), displayBuffer, "image/jpeg"),
      uploadPublic(ogpKey(hash), ogpBuffer, "image/jpeg"),
    ]);

    // Supabase ページ作成（contentHash/assetId はアプリからのPATCHで後から設定）
    const record = await createPage({
      contentHash: `0x${hash}`,
      assetId: "",
      thumbnailUrl,
      ogpImageUrl,
    });

    const baseUrl = process.env.PUBLIC_PAGE_URL || "https://www.rootlens.io";
    const pageUrl = `${baseUrl}/p/${record.shortId}`;

    return NextResponse.json({
      shortId: record.shortId,
      pageUrl,
      contentHash: `0x${hash}`,
    });
  } catch (e: unknown) {
    console.error("[publish] Error:", e);
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
