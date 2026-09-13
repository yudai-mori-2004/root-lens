import { randomBytes } from "node:crypto";

const SITE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const UNIT_ID_RE = /^unit_[a-z0-9][a-z0-9_-]{0,63}_\d{8}T\d{9}Z_[0-9A-HJKMNP-TV-Z]{8}$/;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function compactUtc(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error("Invalid recording time");
  return value.toISOString().replace(/[-:]/g, "").replace(".", "");
}

function randomSuffix(length = 8): string {
  const bytes = randomBytes(length);
  let result = "";
  for (const byte of bytes) result += CROCKFORD[byte & 31];
  return result;
}

export function createUnitId(siteId: string, recordedAt: Date): string {
  if (!SITE_RE.test(siteId)) throw new Error("Invalid site id");
  const unitId = `unit_${siteId}_${compactUtc(recordedAt)}_${randomSuffix()}`;
  if (!UNIT_ID_RE.test(unitId)) throw new Error("Generated unit id is invalid");
  return unitId;
}
