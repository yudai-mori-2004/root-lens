import { timingSafeEqual } from "node:crypto";

export function verifyDocumensoWebhook(header: string | null): boolean {
  const secret = process.env.DOCUMENSO_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const actual = Buffer.from(header, "utf8");
  const expected = Buffer.from(secret, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function documensoCompletion(value: unknown): { envelopeId: string; externalId: string | null } | null {
  if (!value || typeof value !== "object") return null;
  const notification = value as {
    event?: unknown;
    payload?: { envelopeId?: unknown; externalId?: unknown };
  };
  if (notification.event !== "DOCUMENT_COMPLETED") return null;
  const { envelopeId, externalId } = notification.payload ?? {};
  if (typeof envelopeId !== "string" || !envelopeId) return null;
  if (externalId !== null && typeof externalId !== "string") return null;
  return { envelopeId, externalId: externalId ?? null };
}
