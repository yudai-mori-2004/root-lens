import { canonicalJson, sha256 } from "./encoding";
import { sortedUnitFiles, unitFilesSha256, type UnitFile } from "./unit-files";

type AgreementRecord = Readonly<{
  record_id: string;
  kind: "site_agreement" | "staff_consent";
  document_version: string;
  template_sha256: string;
  signed_pdf_sha256: string;
  authentication_method: string;
  signed_at: string;
}>;

type EvidenceInput<TApproval extends Record<string, unknown>> = Readonly<{
  evidenceId: string;
  issuedAt: Date;
  siteId: string;
  unitId: string;
  filesSha256: string;
  files: UnitFile[];
  consentSnapshotId: string;
  consentSnapshotSha256: string;
  agreements: AgreementRecord[];
  approvalRecord: TApproval;
}>;

export function validEvidenceChronology(input: Readonly<{
  agreementSignedAt: string[];
  snapshotCreatedAt: Date;
  approvalIssuedAt: string;
  approvalExpiresAt: string;
  approvedAt: string;
  evidenceIssuedAt: Date;
}>): boolean {
  const snapshotCreatedAt = input.snapshotCreatedAt.getTime();
  const approvalIssuedAt = new Date(input.approvalIssuedAt).getTime();
  const approvalExpiresAt = new Date(input.approvalExpiresAt).getTime();
  const approvedAt = new Date(input.approvedAt).getTime();
  const issuedAt = input.evidenceIssuedAt.getTime();
  const agreements = input.agreementSignedAt.map((value) => new Date(value).getTime());
  const values = [snapshotCreatedAt, approvalIssuedAt, approvalExpiresAt, approvedAt, issuedAt, ...agreements];
  return values.every(Number.isFinite)
    && agreements.every((value) => value <= snapshotCreatedAt)
    && snapshotCreatedAt <= approvalIssuedAt
    && approvalIssuedAt <= approvedAt
    && approvedAt <= approvalExpiresAt
    && approvedAt <= issuedAt;
}

export function createEvidencePayload<TApproval extends Record<string, unknown>>(input: EvidenceInput<TApproval>) {
  const siteAgreements = input.agreements.filter((record) => record.kind === "site_agreement");
  const staffConsents = input.agreements.filter((record) => record.kind === "staff_consent");
  if (siteAgreements.length !== 1 || staffConsents.length === 0) {
    throw new Error("Evidence requires one site agreement and at least one staff consent");
  }
  if (unitFilesSha256(input.unitId, input.files) !== input.filesSha256) {
    throw new Error("Evidence files do not match their approved unit");
  }
  const agreement = (item: AgreementRecord) => ({
    record_id: item.record_id,
    path: `agreements/${item.record_id}.pdf`,
    document_version: item.document_version,
    template_sha256: item.template_sha256,
    signed_pdf_sha256: item.signed_pdf_sha256,
    authentication_method: item.authentication_method,
    signed_at: item.signed_at,
  });
  return {
    schema: "io.rootlens.evidence.v2",
    evidence_id: input.evidenceId,
    issued_at: input.issuedAt.toISOString(),
    unit: {
      unit_id: input.unitId,
      site_id: input.siteId,
      files_sha256: input.filesSha256,
      files: sortedUnitFiles(input.files),
    },
    agreements: {
      site: agreement(siteAgreements[0]),
      staff: {
        snapshot_id: input.consentSnapshotId,
        snapshot_sha256: input.consentSnapshotSha256,
        records: staffConsents.map(agreement),
      },
    },
    approval: {
      ...input.approvalRecord,
      approval_record_sha256: sha256(canonicalJson(input.approvalRecord)),
    },
  };
}

export function evidencePayloadSha256(evidence: Record<string, unknown>): string {
  return sha256(canonicalJson(evidence));
}
