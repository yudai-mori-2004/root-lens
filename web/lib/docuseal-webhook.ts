import { createHmac, timingSafeEqual } from "node:crypto";

const FIVE_MINUTES_SECONDS = 300;

export function verifyDocuSealWebhook(rawBody: string, header: string | null, now = Date.now()): boolean {
  const secret = process.env.DOCUSEAL_WEBHOOK_TOKEN;
  if (!secret || !header) return false;
  const separator = header.indexOf(".");
  if (separator < 1) return false;
  const timestamp = header.slice(0, separator);
  const actual = header.slice(separator + 1);
  const unixSeconds = Number(timestamp);
  if (!Number.isInteger(unixSeconds) || Math.abs(now / 1000 - unixSeconds) > FIVE_MINUTES_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return actual.length === expected.length
    && timingSafeEqual(Buffer.from(actual, "ascii"), Buffer.from(expected, "ascii"));
}
