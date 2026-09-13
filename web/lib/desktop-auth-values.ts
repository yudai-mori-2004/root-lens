import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sha256 } from "./encoding";

const PKCE_VALUE = /^[A-Za-z0-9_-]{43,128}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailSha256(email: string): string {
  return sha256(normalizeEmail(email));
}

export function validateCodeChallenge(value: string): string {
  if (!PKCE_VALUE.test(value)) throw new Error("invalid PKCE challenge");
  return value;
}

export function codeChallenge(verifier: string): string {
  if (!PKCE_VALUE.test(verifier)) throw new Error("invalid PKCE verifier");
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function validateLoopbackRedirect(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port
      || Number(url.port) < 1024 || Number(url.port) > 65535
      || url.pathname !== "/callback" || url.username || url.password
      || url.search || url.hash) {
    throw new Error("invalid desktop redirect URI");
  }
  return url.toString();
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function secureEqual(left: string, right: string): boolean {
  return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
