import { describe, expect, it } from "vitest";
import { codeChallenge, emailSha256, validateCodeChallenge, validateLoopbackRedirect } from "./desktop-auth-values";

describe("desktop login boundaries", () => {
  it("binds the authorization code to the desktop PKCE verifier", () => {
    const verifier = "A".repeat(43);
    expect(codeChallenge(verifier)).toBe("DwBzhbb51LfusnSGBa_hqYSgo7-j8BTQnip4TOnlzRo");
    expect(validateCodeChallenge(codeChallenge(verifier))).toBe(codeChallenge(verifier));
  });

  it("accepts only an exact IPv4 loopback callback", () => {
    expect(validateLoopbackRedirect("http://127.0.0.1:43119/callback"))
      .toBe("http://127.0.0.1:43119/callback");
    for (const value of [
      "http://localhost:43119/callback",
      "https://127.0.0.1:43119/callback",
      "http://127.0.0.1:43119/other",
      "http://127.0.0.1:43119/callback?code=stolen",
    ]) expect(() => validateLoopbackRedirect(value)).toThrow();
  });

  it("matches an invited email without storing its spelling", () => {
    expect(emailSha256(" Supervisor@Example.com ")).toBe(emailSha256("supervisor@example.com"));
    expect(emailSha256("supervisor@example.com")).toMatch(/^[0-9a-f]{64}$/);
  });
});
