import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  attestEvidencePayload, createEvidencePayload, deliveryManifestSha256,
  validEvidenceChronology, verifyEvidenceAttestation,
} from "./evidence";
import { canonicalJson, sha256 } from "./encoding";

const agreement = (kind: "site_agreement" | "staff_consent", id: string) => ({
  record_id: id,
  kind,
  document_version: `${kind}-v1`,
  template_sha256: "1".repeat(64),
  signed_pdf_sha256: "2".repeat(64),
  certificate_sha256: "3".repeat(64),
  signed_at: "2026-09-13T00:00:00.000Z",
  status: "active",
});

const sourceFiles = [{ path: "rgb.mp4", size: 10, sha256: "4".repeat(64) }];
const deliveryFiles = [{ path: "session.mcap", size: 20, sha256: "5".repeat(64) }];

function payload() {
  return createEvidencePayload({
    evidenceId: "evd_test",
    issuedAt: new Date("2026-09-14T00:00:00.000Z"),
    origin: "https://www.rootlens.io",
    siteId: "site_test",
    unitId: "unit_site_test_20260930134055",
    sourceManifestSha256: "6".repeat(64),
    sourceFiles,
    recordedAt: "2026-09-13T12:00:00.000Z",
    recordingConfig: "mentra",
    consentSnapshotId: "csp_test",
    consentSnapshotSha256: "7".repeat(64),
    agreements: [agreement("site_agreement", "agr_site"), agreement("staff_consent", "agr_staff")],
    approvalReceipt: { event_id: "apv_test", signed_payload_sha256: "8".repeat(64) },
    deliveryFiles,
    privacyProcessingCompletedAt: "2026-09-14T01:00:00.000Z",
    providedAt: "2026-09-21T01:00:00.000Z",
  });
}

describe("delivery evidence", () => {
  it("accepts only consent, approval, privacy processing and delivery in their required order", () => {
    const chronology = {
      agreementSignedAt: ["2026-09-13T00:00:00.000Z"],
      snapshotCreatedAt: new Date("2026-09-13T10:00:00.000Z"),
      approvalIssuedAt: "2026-09-13T10:01:00.000Z",
      approvalExpiresAt: "2026-09-13T10:11:00.000Z",
      approvedAt: "2026-09-13T10:02:00.000Z",
      recordedAt: "2026-09-13T09:00:00.000Z",
      privacyProcessingCompletedAt: "2026-09-14T01:00:00.000Z",
      providedAt: "2026-09-21T01:00:00.000Z",
      evidenceIssuedAt: new Date("2026-09-21T01:00:01.000Z"),
    };
    expect(validEvidenceChronology(chronology)).toBe(true);
    expect(validEvidenceChronology({
      ...chronology,
      providedAt: "2026-09-21T00:59:59.999Z",
    })).toBe(false);
    expect(validEvidenceChronology({
      ...chronology,
      approvedAt: "2026-09-13T10:12:00.000Z",
    })).toBe(false);
    expect(validEvidenceChronology({
      ...chronology,
      agreementSignedAt: ["2026-09-13T10:00:01.000Z"],
    })).toBe(false);
  });

  it("links the raw unit, consent snapshot, approval and final files without personal details", () => {
    const value = payload();
    expect(value.source.unit_id).toBe("unit_site_test_20260930134055");
    expect(value.agreements.staff_consent_snapshot.records).toHaveLength(1);
    expect(value.approval.event_id).toBe("apv_test");
    expect(value.delivery.delivery_manifest_sha256).toBe(deliveryManifestSha256(value.source.unit_id, deliveryFiles));
    expect(JSON.stringify(value)).not.toContain("email");
  });

  it("signs the canonical payload digest with the non-exportable KMS key", async () => {
    vi.stubEnv("EVIDENCE_KMS_KEY_ID", "arn:aws:kms:ap-northeast-1:123:key/test");
    vi.stubEnv("EVIDENCE_PUBLIC_KEY_ID", "rootlens-evidence-2026-01");
    const send = vi.fn().mockResolvedValue({ Signature: Uint8Array.of(1, 2, 3) });
    const attestation = await attestEvidencePayload(payload(), { send } as never);
    expect(attestation).toMatchObject({
      algorithm: "ECDSA_P256_SHA256",
      key_id: "rootlens-evidence-2026-01",
      signature: "AQID",
    });
    expect(send).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });

  it("verifies the published evidence signature and rejects changed delivery bytes", () => {
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const value = payload();
    const canonical = canonicalJson(value);
    const evidence = {
      ...value,
      attestation: {
        algorithm: "ECDSA_P256_SHA256" as const,
        key_id: "test",
        payload_sha256: sha256(canonical),
        signature: sign("sha256", Buffer.from(canonical), keys.privateKey).toString("base64url"),
      },
    };
    const publicKey = keys.publicKey.export({ format: "pem", type: "spki" }).toString();
    expect(verifyEvidenceAttestation(evidence, publicKey)).toBe(true);
    const changed = {
      ...evidence,
      delivery: {
        ...evidence.delivery,
        files: evidence.delivery.files.map((file, index) => index === 0 ? { ...file, size: file.size + 1 } : file),
      },
    };
    expect(verifyEvidenceAttestation(changed, publicKey)).toBe(false);
  });
});
