import { afterEach, describe, expect, it, vi } from "vitest";
import { documensoCompletion, verifyDocumensoWebhook } from "./documenso-webhook";

afterEach(() => vi.unstubAllEnvs());

describe("Documenso webhook verification", () => {
  it("accepts only the configured shared secret", () => {
    vi.stubEnv("DOCUMENSO_WEBHOOK_SECRET", "webhook-secret");
    expect(verifyDocumensoWebhook("webhook-secret")).toBe(true);
    expect(verifyDocumensoWebhook("webhook-secret-changed")).toBe(false);
    expect(verifyDocumensoWebhook(null)).toBe(false);
  });

  it("reads the envelope ID rather than the legacy numeric document ID", () => {
    expect(documensoCompletion({
      event: "DOCUMENT_COMPLETED",
      payload: { id: 42, envelopeId: "envelope_123", externalId: "agr_123" },
    })).toEqual({ envelopeId: "envelope_123", externalId: "agr_123" });
  });

  it("rejects other events and malformed completion payloads", () => {
    expect(documensoCompletion({ event: "DOCUMENT_CREATED", payload: { envelopeId: "envelope_123" } })).toBeNull();
    expect(documensoCompletion({ event: "DOCUMENT_COMPLETED", payload: { id: 42 } })).toBeNull();
  });
});
