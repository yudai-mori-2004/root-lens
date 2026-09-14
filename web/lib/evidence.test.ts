import { describe, expect, it } from "vitest";
import { createEvidencePayload, evidencePayloadSha256, validEvidenceChronology } from "./evidence";
import { unitFilesSha256 } from "./unit-files";

const agreement = (kind: "site_agreement" | "staff_consent", id: string) => ({
  record_id: id,
  kind,
  document_version: `${kind}-v1`,
  template_sha256: "1".repeat(64),
  signed_pdf_sha256: "2".repeat(64),
  authentication_method: "sms_otp",
  signed_at: "2026-09-13T00:00:00.000Z",
});
const files = [
  { path: "session.mcap", bytes: 20, sha256: "5".repeat(64) },
  { path: "vendor/custom.data", bytes: 10, sha256: "4".repeat(64) },
];
const unitId = "unit_site_test_20260930134055";

function payload() {
  return createEvidencePayload({
    evidenceId: "evd_test",
    issuedAt: new Date("2026-09-14T00:00:00.000Z"),
    siteId: "site_test",
    unitId,
    filesSha256: unitFilesSha256(unitId, files),
    files,
    consentSnapshotId: "csp_test",
    consentSnapshotSha256: "7".repeat(64),
    agreements: [agreement("site_agreement", "agr_site"), agreement("staff_consent", "agr_staff")],
    approvalRecord: { approval_id: "apv_test", approval_subject_sha256: "8".repeat(64) },
  });
}

describe("unit evidence", () => {
  it("accepts only consent, approval and evidence issuance in their required order", () => {
    const chronology = {
      agreementSignedAt: ["2026-09-13T00:00:00.000Z"],
      snapshotCreatedAt: new Date("2026-09-13T10:00:00.000Z"),
      approvalIssuedAt: "2026-09-13T10:01:00.000Z",
      approvalExpiresAt: "2026-09-13T10:11:00.000Z",
      approvedAt: "2026-09-13T10:02:00.000Z",
      evidenceIssuedAt: new Date("2026-09-13T10:03:00.000Z"),
    };
    expect(validEvidenceChronology(chronology)).toBe(true);
    expect(validEvidenceChronology({ ...chronology, approvedAt: "2026-09-13T10:12:00.000Z" })).toBe(false);
    expect(validEvidenceChronology({
      ...chronology, agreementSignedAt: ["2026-09-13T10:00:01.000Z"],
    })).toBe(false);
  });

  it("contains one approved unit without source, delivery, processing or URLs", () => {
    const value = payload();
    expect(value.unit).toMatchObject({ unit_id: unitId, files });
    expect(value.agreements.site.path).toBe("agreements/agr_site.pdf");
    expect(value.approval.approval_id).toBe("apv_test");
    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain("source");
    expect(serialized).not.toContain("delivery");
    expect(serialized).not.toContain("provided_at");
    expect(serialized).not.toContain("privacy_processing");
    expect(serialized).not.toContain("status_at_approval");
    expect(serialized).not.toContain("http");
  });

  it("produces a stable DB comparison hash", () => {
    expect(evidencePayloadSha256(payload())).toMatch(/^[0-9a-f]{64}$/);
    expect(evidencePayloadSha256(payload())).toBe(evidencePayloadSha256(payload()));
  });
});
