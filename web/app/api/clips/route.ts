import { NextResponse } from "next/server";
import { eq, desc, and, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { clips, uploadUnits } from "@/db/schema";
import { authenticateAccount } from "@/lib/auth";
import { clipToDto, clipsToDtos } from "@/lib/mapper";
import { verifyRawSessionUploadMetadata } from "@/lib/r2";
import { validateRawSourceManifest } from "@/lib/raw-source";
import { SHA256_RE } from "@/lib/source-manifest";
import { UNIT_ID_RE } from "@/lib/unit-id";
import { reservationCutoff } from "@/lib/upload-reservation";
import type {
  CreateClipRequest,
  CreateClipResponse,
  ListClipsResponse,
} from "@/shared/api-types";

// GET /api/clips
// 撮影アカウント (= Bearer token の sub) の所有クリップ一覧を新しい順に返す。
// optional query: unitId を渡すと絞り込む (= 端末の冪等チェック用)。
export async function GET(req: Request) {
  const authentication = await authenticateAccount(req);
  if (!authentication.ok) return authentication.response;
  const { accountId } = authentication;

  const url = new URL(req.url);
  const unitId = url.searchParams.get("unitId");

  const conditions = [eq(clips.accountId, accountId)];
  if (unitId) conditions.push(eq(clips.unitId, unitId));

  const rows = await db
    .select()
    .from(clips)
    .where(and(...conditions))
    .orderBy(desc(clips.createdAt))
    .limit(200);

  const body: ListClipsResponse = { clips: clipsToDtos(rows) };
  return NextResponse.json(body);
}

// POST /api/clips
// unit_id発行、source manifest確定、R2 rawアップロード後に呼ぶ登録endpoint。
// unit_idがPK (= ストレージのraw/<unit_id>/と1:1)。同一IDの再登録は
// 同一アカウントなら idempotent に既存行を返し、 別アカウントなら 409。
const sourceFileSchema = z.object({
  name: z.string().min(1).max(128),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(SHA256_RE),
});
const createSchema = z.object({
  unitId: z.string().regex(UNIT_ID_RE, "invalid unit id"),
  videoBytes: z.number().int().positive(),
  sourceManifestSha256: z.string().regex(SHA256_RE),
  sourceFiles: z.array(sourceFileSchema).min(2).max(32),
  recordingConfig: z.enum(["ultra_wide", "arkit", "iphone"]),
  durationMs: z.number().int().positive().optional(),
  deviceModel: z.string().min(1).max(64).optional(),
  consentEventId: z.string().min(1).max(64).optional(),
}) satisfies z.ZodType<CreateClipRequest>;

export async function POST(req: Request) {
  const authentication = await authenticateAccount(req);
  if (!authentication.ok) return authentication.response;
  const { accountId } = authentication;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch (e) {
    console.warn("[POST /api/clips] body JSON parse failed:", e);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const manifestError = validateRawSourceManifest(parsed.data);
  if (manifestError) {
    return NextResponse.json({ error: manifestError }, { status: 400 });
  }
  const video = parsed.data.sourceFiles.find((file) => file.name === "rgb.mp4");
  if (video?.bytes !== parsed.data.videoBytes) {
    return NextResponse.json({ error: "rgb.mp4 byte size mismatch" }, { status: 400 });
  }

  // 重複排除 (= unit_id は世界一意)。
  const existing = await db
    .select()
    .from(clips)
    .where(eq(clips.unitId, parsed.data.unitId))
    .limit(1);
  if (existing.length > 0) {
    if (existing[0].accountId !== accountId) {
      return NextResponse.json(
        { error: "unit_id already registered by another account" },
        { status: 409 },
      );
    }
    if (existing[0].recordingConfig !== parsed.data.recordingConfig
        || existing[0].sourceManifestSha256 !== parsed.data.sourceManifestSha256) {
      return NextResponse.json({ error: "unit_id is already registered with different source data" }, { status: 409 });
    }
    const body: CreateClipResponse = { clip: clipToDto(existing[0]) };
    return NextResponse.json(body);
  }

  const reservations = await db.select().from(uploadUnits).where(and(
    eq(uploadUnits.unitId, parsed.data.unitId),
    eq(uploadUnits.accountId, accountId),
    eq(uploadUnits.recordingConfig, parsed.data.recordingConfig),
    gt(uploadUnits.createdAt, reservationCutoff()),
  )).limit(1);
  if (reservations.length === 0) {
    return NextResponse.json({ error: "unit id is not reserved for this account and recording config" }, { status: 403 });
  }

  try {
    await verifyRawSessionUploadMetadata({
      unitId: parsed.data.unitId,
      recordingConfig: parsed.data.recordingConfig,
      sourceManifestSha256: parsed.data.sourceManifestSha256,
      sourceFiles: parsed.data.sourceFiles,
    });
  } catch (error) {
    console.error("[POST /api/clips] R2 source verification failed:", error);
    return NextResponse.json({ error: "uploaded source files failed integrity verification" }, { status: 409 });
  }

  // 新規作成。 端末は R2 アップロード完了後にのみ登録する (= presign は /api/v1/raw-uploads の役目)。
  const result = await db.transaction(async (tx) => {
    const [created] = await tx.insert(clips).values({
        unitId: parsed.data.unitId,
        accountId,
        consentEventId: parsed.data.consentEventId ?? null,
        recordingConfig: parsed.data.recordingConfig,
        videoBytes: parsed.data.videoBytes,
        sourceManifestSha256: parsed.data.sourceManifestSha256,
        sourceFiles: parsed.data.sourceFiles,
        durationMs: parsed.data.durationMs ?? null,
        deviceModel: parsed.data.deviceModel ?? null,
        recordedAt: reservations[0].recordedAt,
      }).onConflictDoNothing().returning();
    if (created) {
      await tx.delete(uploadUnits).where(eq(uploadUnits.unitId, parsed.data.unitId));
      return { row: created, inserted: true };
    }
    const [concurrent] = await tx.select().from(clips)
      .where(eq(clips.unitId, parsed.data.unitId)).limit(1);
    if (!concurrent
        || concurrent.accountId !== accountId
        || concurrent.recordingConfig !== parsed.data.recordingConfig
        || concurrent.sourceManifestSha256 !== parsed.data.sourceManifestSha256) {
      throw new Error("unit id registration conflict");
    }
    return { row: concurrent, inserted: false };
  });

  const responseBody: CreateClipResponse = { clip: clipToDto(result.row) };
  return NextResponse.json(responseBody, { status: result.inserted ? 201 : 200 });
}
