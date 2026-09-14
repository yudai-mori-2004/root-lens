import { describe, expect, it } from "vitest";
import {
  approvalSubjectSha256, createApprovalRecord, createApprovalSubject,
} from "./approval-record";

const subjectInput = {
  requestId: "approval_test",
  personId: "person_test",
  siteId: "site_test",
  unitId: "unit_site_test_20260930134055",
  filesSha256: "a".repeat(64),
  consentSnapshotId: "csp_test",
  consentSnapshotSha256: "c".repeat(64),
  issuedAt: new Date("2026-09-14T00:00:00.000Z"),
  expiresAt: new Date("2026-09-14T00:10:00.000Z"),
};

function record(input = subjectInput) {
  return createApprovalRecord({
    approvalId: "apv_test",
    subject: createApprovalSubject(input),
    identityId: "identity_test",
    personId: "person_test",
    approvedAt: new Date("2026-09-14T00:01:00.000Z"),
  });
}

describe("approval record", () => {
  it("records an SMS-authenticated approval without claiming a digital signature", () => {
    const value = record();
    expect(value).toMatchObject({
      approval_subject: {
        person_id: subjectInput.personId,
        site_id: subjectInput.siteId,
        unit_id: subjectInput.unitId,
        files_sha256: subjectInput.filesSha256,
        consent_snapshot_sha256: subjectInput.consentSnapshotSha256,
      },
      approval_method: "sms_authenticated_clickwrap",
      approver: {
        identity_id: "identity_test",
        person_id: "person_test",
        authentication_method: "sms_otp",
      },
    });
    expect(value.approval_subject.statement_version).toBe("unit-approval-ja-1");
    expect(JSON.stringify(value)).not.toContain("signed");
    expect(JSON.stringify(value)).not.toContain("signature");
  });

  it("binds the approval to the exact unit files and consent snapshot", () => {
    const subject = createApprovalSubject(subjectInput);
    expect(record().approval_subject_sha256).toBe(approvalSubjectSha256(subject));
    expect(approvalSubjectSha256(createApprovalSubject({
      ...subjectInput, filesSha256: "d".repeat(64),
    }))).not.toBe(approvalSubjectSha256(subject));
  });
});
