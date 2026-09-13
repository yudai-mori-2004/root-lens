import { NextResponse } from "next/server";
import { eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accounts, uploadUnits } from "@/db/schema";
import { authenticateAccount } from "@/lib/auth";
import { createUnitId } from "@/lib/unit-id";
import { reservationCutoff, reservationExpiry } from "@/lib/upload-reservation";

const requestSchema = z.object({
  recordedAt: z.string().datetime({ offset: true }),
  recordingConfig: z.enum(["ultra_wide", "arkit", "iphone"]),
});

export async function POST(req: Request) {
  const authentication = await authenticateAccount(req);
  if (!authentication.ok) return authentication.response;
  const { accountId } = authentication;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.format() }, { status: 400 });
  }

  const rows = await db.select({ site: accounts.site }).from(accounts)
    .where(eq(accounts.id, accountId)).limit(1);
  if (rows.length === 0) {
    return NextResponse.json({ error: "Account has no site configuration" }, { status: 409 });
  }

  const unitId = createUnitId(rows[0].site, new Date(parsed.data.recordedAt));
  const now = new Date();
  await db.delete(uploadUnits).where(lt(uploadUnits.createdAt, reservationCutoff(now)));
  await db.insert(uploadUnits).values({
    unitId,
    accountId,
    recordingConfig: parsed.data.recordingConfig,
    recordedAt: new Date(parsed.data.recordedAt),
  });
  return NextResponse.json({
    unitId,
    siteId: rows[0].site,
    expiresAt: reservationExpiry(now).toISOString(),
  }, { status: 201 });
}
