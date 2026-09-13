// POST /api/v1/raw-uploads
//
// 端末のアップロード用 presigned PUT URL endpoint。
//
// 流れ:
//   1. server が unit_id を発行し、account + recording config に予約する
//   2. device がsource manifestを確定する
//   3. このendpointが予約所有者を確認してpresigned PUTを返す
//
// /api/clips とは別エンドポイントにする理由:
//   端末は「アップロード可能か」 だけ先に確認したい (= 容量制限・帯域制限・空きスロット等の事前 reject)。
//   /api/clips で行を作る前に presign を出せると、 失敗を早く検出できる。
//
// auth: Bearer token 必須。 presign の発行自体をログイン済みアカウントに限定する。

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { presignRawSessionUploads } from "@/lib/r2";
import { requireAccountId } from "@/lib/auth";
import { UNIT_ID_RE } from "@/lib/unit-id";
import { db } from "@/db/client";
import { uploadUnits } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { SHA256_RE } from "@/lib/source-manifest";
import { validateRawSourceManifest } from "@/lib/raw-source";

const SourceFileSchema = z.object({
  name: z.string().min(1).max(128),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(SHA256_RE),
});

const RequestSchema = z.object({
  unitId: z.string().regex(UNIT_ID_RE, "invalid unit id"),
  // 撮影構成 → アップロード先バケット + ファイルマニフェストが決まる。
  recordingConfig: z.enum(["ultra_wide", "arkit", "mentra", "iphone"]),
  sourceManifestSha256: z.string().regex(SHA256_RE),
  sourceFiles: z.array(SourceFileSchema).min(2).max(32),
});

export async function POST(req: NextRequest) {
  let accountId: string;
  try {
    accountId = await requireAccountId(req);
  } catch (r) {
    return r as Response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const reservations = await db.select().from(uploadUnits).where(and(
    eq(uploadUnits.unitId, parsed.data.unitId),
    eq(uploadUnits.accountId, accountId),
    eq(uploadUnits.recordingConfig, parsed.data.recordingConfig),
  )).limit(1);
  if (reservations.length === 0) {
    return NextResponse.json({ error: "unit id is not reserved for this account and recording config" }, { status: 403 });
  }
  const manifestError = validateRawSourceManifest(parsed.data);
  if (manifestError) {
    return NextResponse.json({ error: manifestError }, { status: 400 });
  }

  try {
    const presigned = await presignRawSessionUploads({
      unitId: parsed.data.unitId,
      recordingConfig: parsed.data.recordingConfig,
      sourceManifestSha256: parsed.data.sourceManifestSha256,
      sourceFiles: parsed.data.sourceFiles,
    });
    return NextResponse.json(presigned);
  } catch (e: unknown) {
    console.error("[raw-uploads] presign failed:", e);
    const msg = e instanceof Error ? e.message : "presign failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
