import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function secret(): string {
  const value = process.env.ROOTLENS_LINK_SECRET;
  if (!value || value.length < 32) throw new Error("ROOTLENS_LINK_SECRET is not configured");
  return value;
}

export function issueSignedToken(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify({ ...payload, nonce: randomBytes(16).toString("base64url") })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function readSignedToken(token: string): Record<string, unknown> {
  const [encoded, signature, ...extra] = token.split(".");
  const expected = createHmac("sha256", secret()).update(encoded ?? "").digest("base64url");
  if (extra.length || !signature || signature.length !== expected.length
      || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("Invalid signed token");
  const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid signed token");
  return value as Record<string, unknown>;
}
