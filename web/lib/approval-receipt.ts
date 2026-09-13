import { base64url, canonicalJson, sha256 } from "./encoding";

export const APPROVAL_STATEMENT = "この撮影データの内容を確認し、現場合意書および撮影参加に関する同意の取得状況に基づき、販売先への提供を承認します。";
export const APPROVAL_STATEMENT_VERSION = "lot-approval-ja-1";

type ApprovalChallengeInput = {
  signatureId: string;
  personId: string;
  siteId: string;
  unitId: string;
  sourceManifestSha256: string;
  sourceFiles: unknown;
  consentSnapshotId: string;
  consentSnapshotSha256: string;
  issuedAt: Date;
  expiresAt: Date;
};

type ApprovalReceiptInput = {
  eventId: string;
  signedPayload: ReturnType<typeof createApprovalChallenge>;
  credentialId: string;
  credentialPublicKey: string;
  credentialCounterBefore: number;
  credentialCounterAfter: number;
  rpId: string;
  origin: string;
  assertion: unknown;
  approvedAt: Date;
};

export function createApprovalChallenge(input: ApprovalChallengeInput) {
  return {
    schema: "io.rootlens.approval-challenge.v1",
    signature_id: input.signatureId,
    person_id: input.personId,
    site_id: input.siteId,
    unit_id: input.unitId,
    source_manifest_sha256: input.sourceManifestSha256,
    source_files: input.sourceFiles,
    consent_snapshot_id: input.consentSnapshotId,
    consent_snapshot_sha256: input.consentSnapshotSha256,
    statement: APPROVAL_STATEMENT,
    statement_version: APPROVAL_STATEMENT_VERSION,
    issued_at: input.issuedAt.toISOString(),
    expires_at: input.expiresAt.toISOString(),
  };
}

export function approvalChallengeSha256(payload: ReturnType<typeof createApprovalChallenge>): string {
  return sha256(canonicalJson(payload));
}

export function approvalWebAuthnChallenge(payload: ReturnType<typeof createApprovalChallenge>): string {
  return base64url(Buffer.from(approvalChallengeSha256(payload), "hex"));
}

export function createApprovalReceipt(input: ApprovalReceiptInput) {
  const signedPayloadSha256 = approvalChallengeSha256(input.signedPayload);
  return {
    schema: "io.rootlens.approval-receipt.v1",
    event_id: input.eventId,
    signed_payload: input.signedPayload,
    signed_payload_sha256: signedPayloadSha256,
    signature_method: "webauthn",
    webauthn: {
      credential_id: input.credentialId,
      credential_public_key: input.credentialPublicKey,
      credential_counter_before: input.credentialCounterBefore,
      credential_counter_after: input.credentialCounterAfter,
      rp_id: input.rpId,
      origin: input.origin,
      challenge: base64url(Buffer.from(signedPayloadSha256, "hex")),
      assertion: input.assertion,
      assertion_sha256: sha256(canonicalJson(input.assertion)),
    },
    approved_at: input.approvedAt.toISOString(),
  };
}
