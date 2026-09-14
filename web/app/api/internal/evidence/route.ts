import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  approvalEvents, approvalRequests, consentSnapshots, driveUploadAttempts, driveUploadFiles, evidenceBundles,
} from "@/db/schema";
import { canonicalJson, sha256 } from "@/lib/encoding";
import { createEvidencePayload, evidencePayloadSha256, validEvidenceChronology } from "@/lib/evidence";
import { authenticateInternalRequest } from "@/lib/internal-auth";
import { APPROVAL_STATEMENT, APPROVAL_STATEMENT_VERSION } from "@/lib/approval-record";
import { unitFilesSha256 } from "@/lib/unit-files";
import { verifyStoredDriveUpload } from "@/lib/drive-upload";
import { siteDrive } from "@/lib/site-drive";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const bodySchema = z.object({ uploadAttemptId: z.string().min(1).max(100) });
const agreementSchema = z.object({
  record_id: z.string(),
  kind: z.enum(["site_agreement", "staff_consent"]),
  document_version: z.string(),
  template_sha256: hash,
  signed_pdf_sha256: hash,
  authentication_method: z.literal("sms_otp"),
  signed_at: z.string().datetime({ offset: true }),
});
const approvalRecordSchema = z.object({
  schema: z.literal("io.rootlens.approval-record.v1"),
  approval_id: z.string(),
  approval_subject: z.object({
    schema: z.literal("io.rootlens.approval-subject.v1"),
    approval_request_id: z.string(),
    person_id: z.string(),
    site_id: z.string(),
    unit_id: z.string(),
    files_sha256: hash,
    consent_snapshot_id: z.string(),
    consent_snapshot_sha256: hash,
    statement: z.literal(APPROVAL_STATEMENT),
    statement_version: z.literal(APPROVAL_STATEMENT_VERSION),
    issued_at: z.string().datetime({ offset: true }),
    expires_at: z.string().datetime({ offset: true }),
  }),
  approval_subject_sha256: hash,
  approval_method: z.literal("sms_authenticated_clickwrap"),
  approver: z.object({
    identity_id: z.string(),
    person_id: z.string(),
    authentication_method: z.literal("sms_otp"),
  }),
  approved_at: z.string().datetime({ offset: true }),
});

export async function POST(request: Request) {
  const unauthorized = authenticateInternalRequest(request);
  if (unauthorized) return unauthorized;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid evidence request" }, { status: 400 });

  const [record] = await db.select({
    attemptId: driveUploadAttempts.id,
    siteId: driveUploadAttempts.siteId,
    unitId: driveUploadAttempts.unitId,
    filesSha256: driveUploadAttempts.filesSha256,
    folderId: driveUploadAttempts.folderId,
    approvalEventId: approvalEvents.id,
    approvalRequestId: approvalRequests.id,
    approvalRecord: approvalEvents.receipt,
    approvalPersonId: approvalEvents.personId,
    approvalIdentityId: approvalEvents.identityId,
    approvalSubjectSha256: approvalEvents.approvalSubjectSha256,
    approvalAuthenticationMethod: approvalEvents.authenticationMethod,
    approvalApprovedAt: approvalEvents.approvedAt,
    consentSnapshotId: consentSnapshots.id,
    consentSnapshotSha256: consentSnapshots.snapshotSha256,
    consentSnapshotCreatedAt: consentSnapshots.createdAt,
    agreements: consentSnapshots.records,
  }).from(driveUploadAttempts)
    .innerJoin(approvalEvents, eq(approvalEvents.id, driveUploadAttempts.approvalEventId))
    .innerJoin(approvalRequests, eq(approvalRequests.id, approvalEvents.requestId))
    .innerJoin(consentSnapshots, eq(consentSnapshots.id, approvalRequests.consentSnapshotId))
    .where(and(
      eq(driveUploadAttempts.id, parsed.data.uploadAttemptId),
      eq(driveUploadAttempts.status, "complete"),
    )).limit(1);
  if (!record) return Response.json({ error: "verified unit not found" }, { status: 404 });

  const storedFiles = await db.select().from(driveUploadFiles)
    .where(eq(driveUploadFiles.attemptId, record.attemptId));
  const files = storedFiles.map((file) => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 }));
  const agreements = z.array(agreementSchema).safeParse(record.agreements);
  const approval = approvalRecordSchema.safeParse(record.approvalRecord);
  const subject = approval.success ? approval.data.approval_subject : null;
  if (!agreements.success || !approval.success
      || sha256(canonicalJson(agreements.data)) !== record.consentSnapshotSha256
      || unitFilesSha256(record.unitId, files) !== record.filesSha256
      || approval.data.approval_id !== record.approvalEventId
      || subject!.approval_request_id !== record.approvalRequestId
      || subject!.person_id !== record.approvalPersonId
      || subject!.site_id !== record.siteId
      || subject!.unit_id !== record.unitId
      || subject!.files_sha256 !== record.filesSha256
      || subject!.consent_snapshot_id !== record.consentSnapshotId
      || subject!.consent_snapshot_sha256 !== record.consentSnapshotSha256
      || approval.data.approval_subject_sha256 !== record.approvalSubjectSha256
      || sha256(canonicalJson(subject)) !== approval.data.approval_subject_sha256
      || approval.data.approver.identity_id !== record.approvalIdentityId
      || approval.data.approver.person_id !== record.approvalPersonId
      || approval.data.approver.authentication_method !== record.approvalAuthenticationMethod
      || approval.data.approved_at !== record.approvalApprovedAt.toISOString()) {
    return Response.json({ error: "stored evidence is inconsistent" }, { status: 409 });
  }

  try {
    const { site, drive } = await siteDrive(record.siteId);
    await verifyStoredDriveUpload(record, storedFiles, site, drive);
  } catch {
    return Response.json({ error: "stored unit files no longer match their verified upload" }, { status: 409 });
  }

  const issuedAt = new Date();
  if (!validEvidenceChronology({
    agreementSignedAt: agreements.data.map((agreement) => agreement.signed_at),
    snapshotCreatedAt: record.consentSnapshotCreatedAt,
    approvalIssuedAt: subject!.issued_at,
    approvalExpiresAt: subject!.expires_at,
    approvedAt: approval.data.approved_at,
    evidenceIssuedAt: issuedAt,
  })) return Response.json({ error: "evidence chronology is invalid" }, { status: 409 });

  const evidenceId = `evd_${randomUUID()}`;
  const evidence = createEvidencePayload({
    evidenceId,
    issuedAt,
    siteId: record.siteId,
    unitId: record.unitId,
    filesSha256: record.filesSha256,
    files,
    consentSnapshotId: record.consentSnapshotId,
    consentSnapshotSha256: record.consentSnapshotSha256,
    agreements: agreements.data,
    approvalRecord: approval.data,
  });
  await db.insert(evidenceBundles).values({
    id: evidenceId,
    uploadAttemptId: record.attemptId,
    approvalEventId: record.approvalEventId,
    unitId: record.unitId,
    filesSha256: record.filesSha256,
    payloadSha256: evidencePayloadSha256(evidence),
    evidence,
    issuedAt,
  });
  return new Response(`${JSON.stringify(evidence, null, 2)}\n`, {
    status: 201,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="rootlens-evidence.json"',
    },
  });
}
