import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyDocuSealWebhook } from "./docuseal-webhook";

afterEach(() => vi.unstubAllEnvs());

describe("DocuSeal webhook verification", () => {
  it("verifies the exact raw body and rejects stale or changed deliveries", () => {
    vi.stubEnv("DOCUSEAL_WEBHOOK_TOKEN", "whsec_test");
    const now = Date.parse("2026-09-14T00:00:00Z");
    const timestamp = String(now / 1000);
    const body = '{"event_type":"submission.completed"}';
    const signature = createHmac("sha256", "whsec_test").update(`${timestamp}.${body}`).digest("hex");
    expect(verifyDocuSealWebhook(body, `${timestamp}.${signature}`, now)).toBe(true);
    expect(verifyDocuSealWebhook(body + " ", `${timestamp}.${signature}`, now)).toBe(false);
    expect(verifyDocuSealWebhook(body, `${timestamp}.${signature}`, now + 301_000)).toBe(false);
  });
});
