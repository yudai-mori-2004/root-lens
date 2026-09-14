import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  approvalEvents, approvalSignatures, consentSnapshots, driveUploadAttempts, evidenceBundles,
  driveUploadFiles,
} from "@/db/schema";
import { canonicalJson, sha256 } from "@/lib/encoding";
import { createEvidencePayload, evidencePayloadSha256, validEvidenceChronology } from "@/lib/evidence";
import { authenticateInternalRequest } from "@/lib/internal-auth";
import { APPROVAL_STATEMENT, APPROVAL_STATEMENT_VERSION } from "@/lib/approval-receipt";
import { webauthnConfig } from "@/lib/approval";
import { sourceManifestSha256 } from "@/lib/source-manifest";
import { verifyStoredDriveUpload } from "@/lib/drive-upload";
import { siteDrive } from "@/lib/site-drive";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const fileSchema = z.object({
  path: z.string().min(1).max(240).refine((path) => !path.startsWith("/") && !path.split("/").includes("..")),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha256: hash,
});
const bodySchema = z.object({
  uploadAttemptId: z.string().min(1).max(100),
  recordedAt: z.string().datetime({ offset: true }),
  recordingConfig: z.string().min(1).max(100),
  deliveryFiles: z.array(fileSchema).min(1).max(1000),
  privacyProcessingCompletedAt: z.string().datetime({ offset: true }),
  providedAt: z.string().datetime({ offset: true }),
});
const agreementSchema = z.object({
  record_id: z.string(),
  kind: z.enum(["site_agreement", "staff_consent"]),
  document_version: z.string(),
  template_sha256: hash,
  signed_pdf_sha256: hash,
  authentication_method: z.literal("sms_otp"),
  signed_at: z.string().datetime({ offset: true }),
  status: z.string(),
});
const sourceFileSchema = z.object({ name: z.string(), bytes: z.number(), sha256: hash });
const approvalReceiptSchema = z.object({
  event_id: z.string(),
  signed_payload: z.object({
    schema: z.literal("io.rootlens.approval-challenge.v1"),
    signature_id: z.string(),
    person_id: z.string(),
    site_id: z.string(),
    unit_id: z.string(),
    source_manifest_sha256: hash,
    source_files: z.array(sourceFileSchema),
    consent_snapshot_id: z.string(),
    consent_snapshot_sha256: hash,
    statement: z.literal(APPROVAL_STATEMENT),
    statement_version: z.literal(APPROVAL_STATEMENT_VERSION),
    issued_at: z.string().datetime({ offset: true }),
    expires_at: z.string().datetime({ offset: true }),
  }),
  signed_payload_sha256: hash,
  signature_method: z.literal("webauthn"),
  webauthn: z.object({
    credential_id: z.string(),
    credential_public_key: z.string().min(1),
    credential_counter_before: z.number().int().nonnegative(),
    credential_counter_after: z.number().int().nonnegative(),
    rp_id: z.string(),
    origin: z.string().url(),
    challenge: z.string(),
    assertion: z.unknown(),
    assertion_sha256: hash,
  }),
  approved_at: z.string().datetime({ offset: true }),
});

export async function POST(request: Request) {
  const unauthorized = authenticateInternalRequest(request);
  if (unauthorized) return unauthorized;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid evidence request" }, { status: 400 });
  const input = parsed.data;
  if (new Set(input.deliveryFiles.map((file) => file.path)).size !== input.deliveryFiles.length) {
    return Response.json({ error: "delivery file paths must be unique" }, { status: 400 });
  }

  const [record] = await db.select({
    attemptId: driveUploadAttempts.id,
    siteId: driveUploadAttempts.siteId,
    unitId: driveUploadAttempts.unitId,
    sourceManifestSha256: driveUploadAttempts.sourceManifestSha256,
    folderId: driveUploadAttempts.folderId,
    approvalEventId: approvalEvents.id,
    approvalSignatureId: approvalSignatures.id,
    approvalReceipt: approvalEvents.receipt,
    approvalPersonId: approvalEvents.personId,
    approvalCredentialId: approvalEvents.credentialId,
    approvalSignedPayloadSha256: approvalEvents.signedPayloadSha256,
    approvalAssertionSha256: approvalEvents.assertionSha256,
    approvalApprovedAt: approvalEvents.approvedAt,
    sourceFiles: approvalSignatures.sourceFiles,
    consentSnapshotId: consentSnapshots.id,
    consentSnapshotSha256: consentSnapshots.snapshotSha256,
    consentSnapshotCreatedAt: consentSnapshots.createdAt,
    agreements: consentSnapshots.records,
  }).from(driveUploadAttempts)
    .innerJoin(approvalEvents, eq(approvalEvents.id, driveUploadAttempts.approvalEventId))
    .innerJoin(approvalSignatures, eq(approvalSignatures.id, approvalEvents.signatureId))
    .innerJoin(consentSnapshots, eq(consentSnapshots.id, approvalSignatures.consentSnapshotId))
    .where(and(
      eq(driveUploadAttempts.id, input.uploadAttemptId),
      eq(driveUploadAttempts.status, "complete"),
    )).limit(1);
  if (!record) return Response.json({ error: "verified raw upload not found" }, { status: 404 });

  const uploadFiles = await db.select().from(driveUploadFiles)
    .where(eq(driveUploadFiles.attemptId, record.attemptId));

  const agreements = z.array(agreementSchema).safeParse(record.agreements);
  const sourceFiles = z.array(sourceFileSchema).safeParse(record.sourceFiles);
  const approvalReceipt = approvalReceiptSchema.safeParse(record.approvalReceipt);
  const signedPayload = approvalReceipt.success ? approvalReceipt.data.signed_payload : null;
  const webauthn = approvalReceipt.success ? approvalReceipt.data.webauthn : null;
  if (!agreements.success || !sourceFiles.success || !approvalReceipt.success
      || sha256(canonicalJson(agreements.data)) !== record.consentSnapshotSha256
      || approvalReceipt.data.event_id !== record.approvalEventId
      || signedPayload!.signature_id !== record.approvalSignatureId
      || signedPayload!.person_id !== record.approvalPersonId
      || signedPayload!.site_id !== record.siteId
      || signedPayload!.unit_id !== record.unitId
      || signedPayload!.source_manifest_sha256 !== record.sourceManifestSha256
      || canonicalJson(signedPayload!.source_files) !== canonicalJson(sourceFiles.data)
      || sourceManifestSha256(record.unitId, sourceFiles.data) !== record.sourceManifestSha256
      || signedPayload!.consent_snapshot_id !== record.consentSnapshotId
      || signedPayload!.consent_snapshot_sha256 !== record.consentSnapshotSha256
      || approvalReceipt.data.signed_payload_sha256 !== record.approvalSignedPayloadSha256
      || sha256(canonicalJson(signedPayload)) !== approvalReceipt.data.signed_payload_sha256
      || webauthn!.credential_id !== record.approvalCredentialId
      || webauthn!.challenge !== Buffer.from(approvalReceipt.data.signed_payload_sha256, "hex").toString("base64url")
      || sha256(canonicalJson(webauthn!.assertion)) !== webauthn!.assertion_sha256
      || webauthn!.assertion_sha256 !== record.approvalAssertionSha256
      || approvalReceipt.data.approved_at !== record.approvalApprovedAt.toISOString()) {
    return Response.json({ error: "stored approval evidence is inconsistent" }, { status: 409 });
  }

  try {
    const { origin, rpID } = webauthnConfig();
    if (webauthn!.origin !== origin || webauthn!.rp_id !== rpID) throw new Error("WebAuthn scope changed");
    const verified = await verifyAuthenticationResponse({
      response: webauthn!.assertion as AuthenticationResponseJSON,
      expectedChallenge: webauthn!.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: webauthn!.credential_id,
        publicKey: Buffer.from(webauthn!.credential_public_key, "base64url"),
        counter: webauthn!.credential_counter_before,
      },
    });
    if (!verified.verified || verified.authenticationInfo.newCounter !== webauthn!.credential_counter_after) {
      throw new Error("WebAuthn assertion differs from its receipt");
    }
  } catch {
    return Response.json({ error: "stored approval signature is invalid" }, { status: 409 });
  }

  try {
    const { site, drive } = await siteDrive(record.siteId);
    await verifyStoredDriveUpload(record, uploadFiles, site, drive);
  } catch {
    return Response.json({ error: "stored raw files no longer match their verified upload" }, { status: 409 });
  }

  const issuedAt = new Date();
  if (!validEvidenceChronology({
    agreementSignedAt: agreements.data.map((agreement) => agreement.signed_at),
    snapshotCreatedAt: record.consentSnapshotCreatedAt,
    approvalIssuedAt: signedPayload!.issued_at,
    approvalExpiresAt: signedPayload!.expires_at,
    approvedAt: approvalReceipt.data.approved_at,
    recordedAt: input.recordedAt,
    privacyProcessingCompletedAt: input.privacyProcessingCompletedAt,
    providedAt: input.providedAt,
    evidenceIssuedAt: issuedAt,
  })) {
    return Response.json({ error: "evidence chronology or seven-day review period is invalid" }, { status: 409 });
  }

  const evidenceId = `evd_${randomUUID()}`;
  const origin = new URL(process.env.PUBLIC_WEB_ORIGIN ?? "https://www.rootlens.io").origin;
  const payload = createEvidencePayload({
    evidenceId,
    issuedAt,
    origin,
    siteId: record.siteId,
    unitId: record.unitId,
    sourceManifestSha256: record.sourceManifestSha256,
    sourceFiles: sourceFiles.data.map((file) => ({ path: file.name, size: file.bytes, sha256: file.sha256 })),
    recordedAt: input.recordedAt,
    recordingConfig: input.recordingConfig,
    consentSnapshotId: record.consentSnapshotId,
    consentSnapshotSha256: record.consentSnapshotSha256,
    agreements: agreements.data,
    approvalReceipt: approvalReceipt.data,
    deliveryFiles: input.deliveryFiles,
    privacyProcessingCompletedAt: input.privacyProcessingCompletedAt,
    providedAt: input.providedAt,
  });
  const evidence = payload;
  await db.insert(evidenceBundles).values({
    id: evidenceId,
    uploadAttemptId: record.attemptId,
    approvalEventId: record.approvalEventId,
    unitId: record.unitId,
    deliveryManifestSha256: payload.delivery.delivery_manifest_sha256,
    payloadSha256: evidencePayloadSha256(evidence),
    evidence,
    providedAt: new Date(input.providedAt),
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
