import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalEvents, approvalSignatures, consentSnapshots } from "@/db/schema";
import { createApprovalChallenge, createApprovalReceipt } from "@/lib/approval-receipt";
import { secureEqual } from "@/lib/desktop-auth-values";
import { sha256 } from "@/lib/encoding";
import { authenticateOperator, authenticateOperatorBrowser } from "@/lib/operator-browser";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const [approval] = await db.select({
    id: approvalSignatures.id,
    tokenSha256: approvalSignatures.tokenSha256,
    siteId: approvalSignatures.siteId,
    personId: approvalSignatures.personId,
    unitId: approvalSignatures.unitId,
    sourceManifestSha256: approvalSignatures.sourceManifestSha256,
    sourceFiles: approvalSignatures.sourceFiles,
    consentSnapshotId: approvalSignatures.consentSnapshotId,
    consentSnapshotSha256: consentSnapshots.snapshotSha256,
    createdAt: approvalSignatures.createdAt,
    expiresAt: approvalSignatures.expiresAt,
  }).from(approvalSignatures)
    .innerJoin(consentSnapshots, eq(consentSnapshots.id, approvalSignatures.consentSnapshotId))
    .where(and(eq(approvalSignatures.id, id), gt(approvalSignatures.expiresAt, new Date()), eq(approvalSignatures.completed, false)))
    .limit(1);
  if (!approval || typeof body?.token !== "string" || !secureEqual(sha256(body.token), approval.tokenSha256)) {
    return Response.json({ error: "approval is invalid or expired" }, { status: 410 });
  }
  const identityId = await authenticateOperator(request);
  if (!identityId || !await authenticateOperatorBrowser(request, approval.personId)) {
    return Response.json({ error: "browser login is required" }, { status: 401 });
  }
  const signedPayload = createApprovalChallenge({
    signatureId: approval.id,
    personId: approval.personId,
    siteId: approval.siteId,
    unitId: approval.unitId,
    sourceManifestSha256: approval.sourceManifestSha256,
    sourceFiles: approval.sourceFiles,
    consentSnapshotId: approval.consentSnapshotId,
    consentSnapshotSha256: approval.consentSnapshotSha256,
    issuedAt: approval.createdAt,
    expiresAt: approval.expiresAt,
  });
  const eventId = `apv_${randomUUID()}`;
  const approvedAt = new Date();
  const receipt = createApprovalReceipt({ eventId, signedPayload, identityId, personId: approval.personId, approvedAt });
  await db.transaction(async (transaction) => {
    const won = await transaction.update(approvalSignatures).set({ completed: true }).where(and(
      eq(approvalSignatures.id, approval.id), eq(approvalSignatures.completed, false),
    )).returning({ id: approvalSignatures.id });
    if (won.length !== 1) throw new Error("approval already completed");
    await transaction.insert(approvalEvents).values({
      id: eventId,
      signatureId: approval.id,
      siteId: approval.siteId,
      unitId: approval.unitId,
      sourceManifestSha256: approval.sourceManifestSha256,
      personId: approval.personId,
      identityId,
      approvalPayloadSha256: receipt.signed_payload_sha256,
      authenticationMethod: "sms_otp",
      receipt,
      approvedAt,
    });
  });
  return Response.json({ approved: true, approvalEventId: eventId, receipt });
}
