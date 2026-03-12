/**
 * 仕様書 §6.1, §6.2, §6.4
 *
 * POST /api/v1/publish
 *
 * C2PA署名済み画像を受け取り、以下を一括実行する:
 * 1. 表示用画像をリサイズして R2 にアップロード (§6.2)
 * 2. Title Protocol devnet に登録 (§6.1)
 * 3. Supabase にページレコード作成 (§6.4)
 * 4. shortId + pageUrl を返却
 */

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { uploadPublic, contentKey, ogpKey } from "@/lib/server/r2";
import { registerContent } from "@/lib/server/title-protocol";
import { createPage } from "@/lib/server/page-store";

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

    // --- Pipeline A + B を並列実行 ---

    // Pipeline A: Title Protocol 登録
    const registerPromise = registerContent(originalBytes);

    // Pipeline B: R2 アップロード (表示用 + OGP)
    const uploadPromise = (async () => {
      // 表示用画像: リサイズ
      const displayBuffer = await sharp(originalBytes)
        .resize({ width: DISPLAY_MAX_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      // OGP画像: リサイズ (TODO: 帯付き画像の生成は後続タスク)
      const ogpBuffer = await sharp(originalBytes)
        .resize({ width: OGP_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      // content_hash は TP 登録結果から取得するため、仮のキーで先にアップロード
      // → TP結果を待ってからキーを決める
      return { displayBuffer, ogpBuffer };
    })();

    // 両方待つ
    const [registerResult, { displayBuffer, ogpBuffer }] = await Promise.all([
      registerPromise,
      uploadPromise,
    ]);

    // R2 にアップロード (content_hash 確定後)
    const hash = registerResult.contentHash.replace("0x", "");
    const [thumbnailUrl, ogpImageUrl] = await Promise.all([
      uploadPublic(contentKey(hash), displayBuffer, "image/jpeg"),
      uploadPublic(ogpKey(hash), ogpBuffer, "image/jpeg"),
    ]);

    // --- Supabase ページ作成 ---
    const record = await createPage({
      contentHash: registerResult.contentHash,
      assetId: registerResult.assetId,
      thumbnailUrl,
      ogpImageUrl,
    });

    // --- 公開URL構築 ---
    const baseUrl = process.env.PUBLIC_PAGE_URL || "https://rootlens.io";
    const pageUrl = `${baseUrl}/p/${record.shortId}`;

    return NextResponse.json({
      shortId: record.shortId,
      pageUrl,
      contentHash: registerResult.contentHash,
      assetId: registerResult.assetId,
      txSignature: registerResult.txSignature,
    });
  } catch (e: unknown) {
    console.error("[publish] Error:", e);
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
