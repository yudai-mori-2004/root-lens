import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalEvents, approvalRequests, consentSnapshots } from "@/db/schema";
import { createApprovalRecord, createApprovalSubject } from "@/lib/approval-record";
import { secureEqual } from "@/lib/desktop-auth-values";
import { sha256 } from "@/lib/encoding";
import { authenticateOperator, authenticateOperatorBrowser } from "@/lib/operator-browser";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const [approval] = await db.select({
    id: approvalRequests.id,
    tokenSha256: approvalRequests.tokenSha256,
    siteId: approvalRequests.siteId,
    personId: approvalRequests.personId,
    unitId: approvalRequests.unitId,
    filesSha256: approvalRequests.filesSha256,
    consentSnapshotId: approvalRequests.consentSnapshotId,
    consentSnapshotSha256: consentSnapshots.snapshotSha256,
    createdAt: approvalRequests.createdAt,
    expiresAt: approvalRequests.expiresAt,
  }).from(approvalRequests)
    .innerJoin(consentSnapshots, eq(consentSnapshots.id, approvalRequests.consentSnapshotId))
    .where(and(eq(approvalRequests.id, id), gt(approvalRequests.expiresAt, new Date()), eq(approvalRequests.completed, false)))
    .limit(1);
  if (!approval || typeof body?.token !== "string" || !secureEqual(sha256(body.token), approval.tokenSha256)) {
    return Response.json({ error: "approval is invalid or expired" }, { status: 410 });
  }
  const identityId = await authenticateOperator(request);
  if (!identityId || !await authenticateOperatorBrowser(request, approval.personId)) {
    return Response.json({ error: "browser login is required" }, { status: 401 });
  }
  const subject = createApprovalSubject({
    requestId: approval.id,
    personId: approval.personId,
    siteId: approval.siteId,
    unitId: approval.unitId,
    filesSha256: approval.filesSha256,
    consentSnapshotId: approval.consentSnapshotId,
    consentSnapshotSha256: approval.consentSnapshotSha256,
    issuedAt: approval.createdAt,
    expiresAt: approval.expiresAt,
  });
  const eventId = `apv_${randomUUID()}`;
  const approvedAt = new Date();
  const receipt = createApprovalRecord({ approvalId: eventId, subject, identityId, personId: approval.personId, approvedAt });
  await db.transaction(async (transaction) => {
    const won = await transaction.update(approvalRequests).set({ completed: true }).where(and(
      eq(approvalRequests.id, approval.id), eq(approvalRequests.completed, false),
    )).returning({ id: approvalRequests.id });
    if (won.length !== 1) throw new Error("approval already completed");
    await transaction.insert(approvalEvents).values({
      id: eventId,
      requestId: approval.id,
      siteId: approval.siteId,
      unitId: approval.unitId,
      filesSha256: approval.filesSha256,
      personId: approval.personId,
      identityId,
      approvalSubjectSha256: receipt.approval_subject_sha256,
      authenticationMethod: "sms_otp",
      receipt,
      approvedAt,
    });
  });
  return Response.json({ approved: true, approvalEventId: eventId, receipt });
}
