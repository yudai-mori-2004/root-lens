import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { approvalEvents, approvalRequests } from "@/db/schema";
import { createConsentSnapshot } from "@/lib/approval";
import { APPROVAL_STATEMENT_VERSION } from "@/lib/approval-record";
import { authenticateDesktop } from "@/lib/desktop-auth";
import { randomToken } from "@/lib/desktop-auth-values";
import { validateDesktopUnit } from "@/lib/drive-upload";
import { sha256 } from "@/lib/encoding";

const bodySchema = z.object({
  unitId: z.string().max(160),
  filesSha256: z.string().max(64),
  files: z.array(z.object({
    path: z.string().max(240),
    bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    sha256: z.string().max(64),
  })).min(1).max(1000),
});

export async function POST(request: Request) {
  const authentication = await authenticateDesktop(request);
  if (!authentication.ok) return authentication.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || validateDesktopUnit(
    parsed.data.unitId, parsed.data.filesSha256, parsed.data.files,
  )) return Response.json({ error: "invalid unit files" }, { status: 400 });

  const requests = await db.select({
    filesSha256: approvalRequests.filesSha256,
    eventId: approvalEvents.id,
  }).from(approvalRequests)
    .leftJoin(approvalEvents, eq(approvalEvents.requestId, approvalRequests.id))
    .where(and(
      eq(approvalRequests.siteId, authentication.siteId),
      eq(approvalRequests.unitId, parsed.data.unitId),
    ));
  if (requests.some((item) => item.filesSha256 !== parsed.data.filesSha256)) {
    return Response.json({ error: "unit id already belongs to different bytes" }, { status: 409 });
  }
  const completed = requests.find((item) => item.eventId);
  if (completed) return Response.json({ status: "complete", approvalEventId: completed.eventId });

  try {
    const snapshot = await createConsentSnapshot(authentication.siteId);
    const token = randomToken();
    const id = `approval_${randomUUID()}`;
    await db.insert(approvalRequests).values({
      id,
      tokenSha256: sha256(token),
      siteId: authentication.siteId,
      personId: authentication.personId,
      unitId: parsed.data.unitId,
      filesSha256: parsed.data.filesSha256,
      files: [...parsed.data.files].sort((a, b) => a.path.localeCompare(b.path)),
      consentSnapshotId: snapshot.id,
      statementVersion: APPROVAL_STATEMENT_VERSION,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const origin = new URL(request.url).origin;
    return Response.json({
      status: "pending",
      approvalId: id,
      approvalUrl: `${origin}/approve/${encodeURIComponent(id)}#token=${encodeURIComponent(token)}`,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    }, { status: 201 });
  } catch {
    return Response.json({ error: "site agreements are not ready" }, { status: 409 });
  }
}
