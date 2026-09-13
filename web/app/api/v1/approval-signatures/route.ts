import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { approvalEvents, approvalSignatures } from "@/db/schema";
import { createConsentSnapshot } from "@/lib/approval";
import { APPROVAL_STATEMENT_VERSION } from "@/lib/approval-receipt";
import { authenticateDesktop } from "@/lib/desktop-auth";
import { randomToken } from "@/lib/desktop-auth-values";
import { validateDesktopManifest } from "@/lib/drive-upload";
import { sha256 } from "@/lib/encoding";

const bodySchema = z.object({
  unitId: z.string().max(160),
  sourceManifestSha256: z.string().max(64),
  files: z.array(z.object({
    name: z.string().max(100),
    bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    sha256: z.string().max(64),
  })).length(4),
});

export async function POST(request: Request) {
  const authentication = await authenticateDesktop(request);
  if (!authentication.ok) return authentication.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || validateDesktopManifest(
    parsed.data.unitId, parsed.data.sourceManifestSha256, parsed.data.files,
  )) return Response.json({ error: "invalid source manifest" }, { status: 400 });

  const signatures = await db.select({
    sourceManifestSha256: approvalSignatures.sourceManifestSha256,
    eventId: approvalEvents.id,
  }).from(approvalSignatures)
    .leftJoin(approvalEvents, eq(approvalEvents.signatureId, approvalSignatures.id))
    .where(and(
      eq(approvalSignatures.siteId, authentication.siteId),
      eq(approvalSignatures.unitId, parsed.data.unitId),
    ));
  if (signatures.some((item) => item.sourceManifestSha256 !== parsed.data.sourceManifestSha256)) {
    return Response.json({ error: "unit id already belongs to different bytes" }, { status: 409 });
  }
  const completed = signatures.find((item) => item.eventId);
  if (completed) return Response.json({ status: "complete", approvalEventId: completed.eventId });

  try {
    const snapshot = await createConsentSnapshot(authentication.siteId);
    const token = randomToken();
    const id = `approval_${randomUUID()}`;
    await db.insert(approvalSignatures).values({
      id,
      tokenSha256: sha256(token),
      siteId: authentication.siteId,
      personId: authentication.personId,
      unitId: parsed.data.unitId,
      sourceManifestSha256: parsed.data.sourceManifestSha256,
      sourceFiles: [...parsed.data.files].sort((a, b) => a.name.localeCompare(b.name)),
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
