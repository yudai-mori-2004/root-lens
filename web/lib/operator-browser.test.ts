import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("desktop SMS freshness", () => {
  it("records the latest SMS verification in the signed browser cookie", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://test:test@127.0.0.1:1/test");
    vi.stubEnv("ROOTLENS_LINK_SECRET", "test-secret-used-only-in-operator-browser-tests-12345");
    const { issueOperatorCookie, operatorAuthenticatedAt } = await import("./operator-browser");
    const { issueSignedToken } = await import("./signed-token");
    const before = Date.now();
    const cookie = issueOperatorCookie("identity_test");
    const request = new Request("https://rootlens.io/desktop/authorize", {
      headers: { cookie: `rootlens_operator=${cookie}` },
    });
    expect(operatorAuthenticatedAt(request)).toBeGreaterThanOrEqual(before);
    expect(operatorAuthenticatedAt(request)).toBeLessThanOrEqual(Date.now());

    const oldCookie = issueSignedToken({ identityId: "identity_test", expiresAt: Date.now() + 60_000 });
    const oldRequest = new Request("https://rootlens.io/desktop/authorize", {
      headers: { cookie: `rootlens_operator=${oldCookie}` },
    });
    expect(operatorAuthenticatedAt(oldRequest)).toBeNull();
  });
});
