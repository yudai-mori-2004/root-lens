import { describe, expect, it } from "vitest";
import {
  approvalChallengeSha256, createApprovalChallenge, createApprovalReceipt,
} from "./approval-receipt";

const challengeInput = {
  signatureId: "approval_test",
  personId: "person_test",
  siteId: "site_test",
  unitId: "unit_site_test_20260930134055",
  sourceManifestSha256: "a".repeat(64),
  sourceFiles: [{ name: "rgb.mp4", bytes: 12, sha256: "b".repeat(64) }],
  consentSnapshotId: "csp_test",
  consentSnapshotSha256: "c".repeat(64),
  issuedAt: new Date("2026-09-14T00:00:00.000Z"),
  expiresAt: new Date("2026-09-14T00:10:00.000Z"),
};

function receipt(input = challengeInput) {
  return createApprovalReceipt({
    eventId: "apv_test",
    signedPayload: createApprovalChallenge(input),
    identityId: "identity_test",
    personId: "person_test",
    approvedAt: new Date("2026-09-14T00:01:00.000Z"),
  });
}

describe("approval receipt", () => {
  it("binds the SMS-authenticated approver, statement, raw manifest and consent snapshot", () => {
    const value = receipt();
    expect(value).toMatchObject({
      signed_payload: {
        person_id: challengeInput.personId,
        site_id: challengeInput.siteId,
        unit_id: challengeInput.unitId,
        source_manifest_sha256: challengeInput.sourceManifestSha256,
        consent_snapshot_sha256: challengeInput.consentSnapshotSha256,
      },
      signature_method: "sms_authenticated_clickwrap",
      signer: {
        identity_id: "identity_test",
        person_id: "person_test",
        authentication_method: "sms_otp",
      },
    });
    expect(value.signed_payload.statement_version).toBe("lot-approval-ja-1");
  });

  it("derives the approval payload hash from the exact source and consent set", () => {
    const payload = createApprovalChallenge(challengeInput);
    expect(receipt().signed_payload_sha256).toBe(approvalChallengeSha256(payload));
    expect(approvalChallengeSha256(createApprovalChallenge({
      ...challengeInput, sourceManifestSha256: "d".repeat(64),
    }))).not.toBe(approvalChallengeSha256(payload));
    expect(approvalChallengeSha256(createApprovalChallenge({
      ...challengeInput, consentSnapshotSha256: "e".repeat(64),
    }))).not.toBe(approvalChallengeSha256(payload));
  });
});
