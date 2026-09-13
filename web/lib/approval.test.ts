import { describe, expect, it } from "vitest";
import {
  approvalChallengeSha256, approvalWebAuthnChallenge, createApprovalChallenge, createApprovalReceipt,
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
    credentialId: "credential_test",
    credentialPublicKey: "public-key",
    credentialCounterBefore: 3,
    credentialCounterAfter: 4,
    rpId: "rootlens.io",
    origin: "https://www.rootlens.io",
    assertion: { id: "assertion" },
    approvedAt: new Date("2026-09-14T00:01:00.000Z"),
  });
}

describe("approval receipt", () => {
  it("binds the approver, statement, raw manifest, consent snapshot and WebAuthn operation", () => {
    const value = receipt();
    expect(value).toMatchObject({
      signed_payload: {
        person_id: challengeInput.personId,
        site_id: challengeInput.siteId,
        unit_id: challengeInput.unitId,
        source_manifest_sha256: challengeInput.sourceManifestSha256,
        consent_snapshot_sha256: challengeInput.consentSnapshotSha256,
      },
      signature_method: "webauthn",
      webauthn: {
        credential_counter_before: 3,
        credential_counter_after: 4,
        rp_id: "rootlens.io",
        origin: "https://www.rootlens.io",
        assertion: { id: "assertion" },
      },
    });
    expect(value.signed_payload.statement_version).toBe("lot-approval-ja-1");
    expect(value.webauthn.challenge).toBe(approvalWebAuthnChallenge(value.signed_payload));
  });

  it("derives the WebAuthn challenge from the exact source and consent set", () => {
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
