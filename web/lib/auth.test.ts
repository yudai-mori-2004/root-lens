import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("./supabase", () => ({
  supabaseAdmin: { auth: { getUser } },
}));

import { authenticateAccount } from "./auth";

describe("authenticateAccount", () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  it("returns an HTTP response for a missing bearer token", async () => {
    const result = await authenticateAccount(new Request("https://rootlens.io/api/clips"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("returns the verified Supabase account id", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "account-1" } }, error: null });
    const request = new Request("https://rootlens.io/api/clips", {
      headers: { authorization: "Bearer token" },
    });
    await expect(authenticateAccount(request)).resolves.toEqual({ ok: true, accountId: "account-1" });
  });

  it("does not disguise an authentication-service failure as an HTTP response", async () => {
    getUser.mockImplementation(async () => {
      throw new Error("network unavailable");
    });
    const request = new Request("https://rootlens.io/api/clips", {
      headers: { authorization: "Bearer token" },
    });
    let thrown: unknown;
    try {
      await authenticateAccount(request);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("network unavailable");
  });
});
