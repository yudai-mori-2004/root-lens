import { canonicalJson, sha256 } from "./encoding";

export type EvidenceFile = Readonly<{ path: string; size: number; sha256: string }>;

type AgreementRecord = Readonly<{
  record_id: string;
  kind: "site_agreement" | "staff_consent";
  document_version: string;
  template_sha256: string;
  signed_pdf_sha256: string;
  authentication_method: string;
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
    authentication_method: item.authentication_method,
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

export function evidencePayloadSha256(evidence: Record<string, unknown>): string {
  return sha256(canonicalJson(evidence));
}
