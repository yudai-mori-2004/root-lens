import { canonicalJson, sha256 } from "./encoding";

export const APPROVAL_STATEMENT = "この撮影データの内容を確認し、現場合意書および撮影参加に関する同意の取得状況に基づき、販売先への提供を承認します。";
export const APPROVAL_STATEMENT_VERSION = "unit-approval-ja-1";

type ApprovalSubjectInput = Readonly<{
  requestId: string;
  personId: string;
  siteId: string;
  unitId: string;
  filesSha256: string;
  consentSnapshotId: string;
  consentSnapshotSha256: string;
  issuedAt: Date;
  expiresAt: Date;
}>;

type ApprovalRecordInput = Readonly<{
  approvalId: string;
  subject: ReturnType<typeof createApprovalSubject>;
  identityId: string;
  personId: string;
  approvedAt: Date;
}>;

export function createApprovalSubject(input: ApprovalSubjectInput) {
  return {
    schema: "io.rootlens.approval-subject.v1",
    approval_request_id: input.requestId,
    person_id: input.personId,
    site_id: input.siteId,
    unit_id: input.unitId,
    files_sha256: input.filesSha256,
    consent_snapshot_id: input.consentSnapshotId,
    consent_snapshot_sha256: input.consentSnapshotSha256,
    statement: APPROVAL_STATEMENT,
    statement_version: APPROVAL_STATEMENT_VERSION,
    issued_at: input.issuedAt.toISOString(),
    expires_at: input.expiresAt.toISOString(),
  };
}

export function approvalSubjectSha256(subject: ReturnType<typeof createApprovalSubject>): string {
  return sha256(canonicalJson(subject));
}

export function createApprovalRecord(input: ApprovalRecordInput) {
  return {
    schema: "io.rootlens.approval-record.v1",
    approval_id: input.approvalId,
    approval_subject: input.subject,
    approval_subject_sha256: approvalSubjectSha256(input.subject),
    approval_method: "sms_authenticated_clickwrap",
    approver: {
      identity_id: input.identityId,
      person_id: input.personId,
      authentication_method: "sms_otp",
    },
    approved_at: input.approvedAt.toISOString(),
  };
}
