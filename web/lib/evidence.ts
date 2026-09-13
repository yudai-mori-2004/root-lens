import { createPublicKey, verify } from "node:crypto";
import { GetPublicKeyCommand, KMSClient, SignCommand } from "@aws-sdk/client-kms";
import { base64url, canonicalJson, sha256 } from "./encoding";

export type EvidenceFile = Readonly<{ path: string; size: number; sha256: string }>;

type AgreementRecord = Readonly<{
  record_id: string;
  kind: "site_agreement" | "staff_consent";
  document_version: string;
  template_sha256: string;
  signed_pdf_sha256: string;
  certificate_sha256: string;
  signed_at: string;
  status: string;
}>;

type EvidenceInput<TApproval extends Record<string, unknown>> = Readonly<{
  evidenceId: string;
  issuedAt: Date;
  origin: string;
  siteId: string;
  unitId: string;
  sourceManifestSha256: string;
  sourceFiles: EvidenceFile[];
  recordedAt: string;
  recordingConfig: string;
  consentSnapshotId: string;
  consentSnapshotSha256: string;
  agreements: AgreementRecord[];
  approvalReceipt: TApproval;
  deliveryFiles: EvidenceFile[];
  privacyProcessingCompletedAt: string;
  providedAt: string;
}>;

export type EvidenceAttestation = Readonly<{
  algorithm: "ECDSA_P256_SHA256";
  key_id: string;
  payload_sha256: string;
  signature: string;
}>;

type EvidenceChronology = Readonly<{
  agreementSignedAt: string[];
  snapshotCreatedAt: Date;
  approvalIssuedAt: string;
  approvalExpiresAt: string;
  approvedAt: string;
  recordedAt: string;
  privacyProcessingCompletedAt: string;
  providedAt: string;
  evidenceIssuedAt: Date;
}>;

export function validEvidenceChronology(input: EvidenceChronology): boolean {
  const snapshotCreatedAt = input.snapshotCreatedAt.getTime();
  const approvalIssuedAt = new Date(input.approvalIssuedAt).getTime();
  const approvalExpiresAt = new Date(input.approvalExpiresAt).getTime();
  const approvedAt = new Date(input.approvedAt).getTime();
  const recordedAt = new Date(input.recordedAt).getTime();
  const processedAt = new Date(input.privacyProcessingCompletedAt).getTime();
  const providedAt = new Date(input.providedAt).getTime();
  const issuedAt = input.evidenceIssuedAt.getTime();
  const values = [snapshotCreatedAt, approvalIssuedAt, approvalExpiresAt, approvedAt,
    recordedAt, processedAt, providedAt, issuedAt,
    ...input.agreementSignedAt.map((value) => new Date(value).getTime())];
  if (values.some((value) => !Number.isFinite(value))) return false;
  return input.agreementSignedAt.every((value) => new Date(value).getTime() <= snapshotCreatedAt)
    && snapshotCreatedAt <= approvalIssuedAt
    && approvalIssuedAt <= approvedAt
    && approvedAt <= approvalExpiresAt
    && recordedAt <= approvedAt
    && approvedAt <= processedAt
    && processedAt + 7 * 24 * 60 * 60_000 <= providedAt
    && providedAt <= issuedAt;
}

function sortedFiles(files: EvidenceFile[]): EvidenceFile[] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}

export function deliveryManifestSha256(unitId: string, files: EvidenceFile[]): string {
  return sha256(canonicalJson({ unit_id: unitId, files: sortedFiles(files) }));
}

export function createEvidencePayload<TApproval extends Record<string, unknown>>(input: EvidenceInput<TApproval>) {
  const siteAgreements = input.agreements.filter((record) => record.kind === "site_agreement");
  const staffConsents = input.agreements.filter((record) => record.kind === "staff_consent");
  if (siteAgreements.length !== 1 || staffConsents.length === 0) {
    throw new Error("Evidence requires one site agreement and at least one staff consent");
  }
  const siteAgreement = siteAgreements[0];
  const record = (item: AgreementRecord) => ({
    record_id: item.record_id,
    record_url: `${input.origin}/verify/${encodeURIComponent(item.record_id)}`,
    document_version: item.document_version,
    template_sha256: item.template_sha256,
    signed_pdf_sha256: item.signed_pdf_sha256,
    signature_certificate_sha256: item.certificate_sha256,
    signed_at: item.signed_at,
    status_at_approval: item.status,
  });
  return {
    schema: "io.rootlens.evidence.v1",
    evidence_id: input.evidenceId,
    issued_at: input.issuedAt.toISOString(),
    source: {
      unit_id: input.unitId,
      source_manifest_sha256: input.sourceManifestSha256,
      recorded_at: input.recordedAt,
      recording_config: input.recordingConfig,
      site_id: input.siteId,
      files: sortedFiles(input.sourceFiles),
    },
    agreements: {
      site: record(siteAgreement),
      staff_consent_snapshot: {
        snapshot_id: input.consentSnapshotId,
        snapshot_sha256: input.consentSnapshotSha256,
        records_url: `${input.origin}/verify/${encodeURIComponent(input.consentSnapshotId)}`,
        record_count: staffConsents.length,
        records: staffConsents.map(record),
        status_at_approval: "active",
      },
    },
    approval: {
      ...input.approvalReceipt,
      receipt_sha256: sha256(canonicalJson(input.approvalReceipt)),
    },
    delivery: {
      delivery_manifest_sha256: deliveryManifestSha256(input.unitId, input.deliveryFiles),
      files: sortedFiles(input.deliveryFiles),
      privacy_processing_completed_at: input.privacyProcessingCompletedAt,
      provided_at: input.providedAt,
    },
    verification: { url: `${input.origin}/verify/${encodeURIComponent(input.evidenceId)}` },
  };
}

export async function attestEvidencePayload(
  payload: ReturnType<typeof createEvidencePayload>,
  client = new KMSClient({}),
): Promise<EvidenceAttestation> {
  const kmsKeyId = process.env.EVIDENCE_KMS_KEY_ID;
  const publicKeyId = process.env.EVIDENCE_PUBLIC_KEY_ID;
  if (!kmsKeyId || !publicKeyId) throw new Error("Evidence signing key is not configured");
  const payloadSha256 = sha256(canonicalJson(payload));
  const result = await client.send(new SignCommand({
    KeyId: kmsKeyId,
    Message: Buffer.from(payloadSha256, "hex"),
    MessageType: "DIGEST",
    SigningAlgorithm: "ECDSA_SHA_256",
  }));
  if (!result.Signature?.length) throw new Error("KMS did not return an evidence signature");
  return {
    algorithm: "ECDSA_P256_SHA256",
    key_id: publicKeyId,
    payload_sha256: payloadSha256,
    signature: base64url(result.Signature),
  };
}

export async function evidencePublicKey(client = new KMSClient({})): Promise<string> {
  const kmsKeyId = process.env.EVIDENCE_KMS_KEY_ID;
  if (!kmsKeyId) throw new Error("Evidence signing key is not configured");
  const result = await client.send(new GetPublicKeyCommand({ KeyId: kmsKeyId }));
  if (!result.PublicKey?.length || result.KeyUsage !== "SIGN_VERIFY" || result.KeySpec !== "ECC_NIST_P256"
      || !result.SigningAlgorithms?.includes("ECDSA_SHA_256")) {
    throw new Error("Evidence KMS key is incompatible");
  }
  return createPublicKey({ key: Buffer.from(result.PublicKey), format: "der", type: "spki" })
    .export({ format: "pem", type: "spki" }).toString();
}

export function verifyEvidenceAttestation(evidence: Record<string, unknown>, publicKeyPem: string): boolean {
  const attestation = evidence.attestation as Partial<EvidenceAttestation> | undefined;
  if (!attestation || attestation.algorithm !== "ECDSA_P256_SHA256"
      || typeof attestation.payload_sha256 !== "string" || typeof attestation.signature !== "string") return false;
  const payload = { ...evidence };
  delete payload.attestation;
  const canonical = canonicalJson(payload);
  if (sha256(canonical) !== attestation.payload_sha256) return false;
  try {
    return verify("sha256", Buffer.from(canonical), publicKeyPem, Buffer.from(attestation.signature, "base64url"));
  } catch {
    return false;
  }
}
