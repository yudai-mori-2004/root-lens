import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clips } from "@/db/schema";
import { authenticateAccount } from "@/lib/auth";
import { clipToDto } from "@/lib/mapper";
import { deleteRawSession, rawBucketFor } from "@/lib/r2";
import type { RecordingConfigId } from "@/lib/r2-keys";
import type { DeleteClipResponse } from "@/shared/api-types";

// path param `id` = unit_id。
interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/clips/:unitId ─ 単件取得 (所有アカウントのみ)
export async function GET(req: Request, ctx: Ctx) {
  const authentication = await authenticateAccount(req);
  if (!authentication.ok) return authentication.response;
  const { accountId } = authentication;
  const { id: unitId } = await ctx.params;

  const rows = await db
    .select()
    .from(clips)
    .where(and(eq(clips.unitId, unitId), eq(clips.accountId, accountId)))
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ clip: clipToDto(rows[0]) });
}

// DELETE /api/clips/:unitId ─ 撮影者本人が raw と一覧行を破棄する。
// R2 を先に消し、成功後だけ DB 行を消す。R2 失敗時は行を残して再試行可能にする。
export async function DELETE(req: Request, ctx: Ctx) {
  const authentication = await authenticateAccount(req);
  if (!authentication.ok) return authentication.response;
  const { accountId } = authentication;
  const { id: unitId } = await ctx.params;

  const rows = await db
    .select()
    .from(clips)
    .where(and(eq(clips.unitId, unitId), eq(clips.accountId, accountId)))
    .limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const clip = rows[0];
  const recordingConfig = clip.recordingConfig as RecordingConfigId;
  if (!["ultra_wide", "arkit", "iphone"].includes(recordingConfig)) {
    return NextResponse.json({ error: "Unsupported recording config" }, { status: 409 });
  }

  let deletedObjects: number;
  try {
    deletedObjects = await deleteRawSession(
      clip.unitId,
      rawBucketFor(recordingConfig),
    );
  } catch (error) {
    console.error(`[DELETE /api/clips/${unitId}] R2 deletion failed`, error);
    return NextResponse.json({ error: "Could not delete clip data" }, { status: 502 });
  }

  await db.delete(clips).where(and(
    eq(clips.unitId, unitId),
    eq(clips.accountId, accountId),
  ));

  const body: DeleteClipResponse = { ok: true, deletedObjects };
  return NextResponse.json(body);
}
