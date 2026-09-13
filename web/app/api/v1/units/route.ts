import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accounts, uploadUnits } from "@/db/schema";
import { requireAccountId } from "@/lib/auth";
import { createUnitId } from "@/lib/unit-id";

const requestSchema = z.object({
  recordedAt: z.string().datetime({ offset: true }),
  recordingConfig: z.enum(["ultra_wide", "arkit", "mentra", "iphone"]),
});

export async function POST(req: Request) {
  let accountId: string;
  try {
    accountId = await requireAccountId(req);
  } catch (response) {
    return response as Response;
  }

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
  await db.insert(uploadUnits).values({
    unitId,
    accountId,
    recordingConfig: parsed.data.recordingConfig,
    recordedAt: new Date(parsed.data.recordedAt),
  });
  return NextResponse.json({ unitId, siteId: rows[0].site }, { status: 201 });
}
