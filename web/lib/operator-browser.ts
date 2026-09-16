import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { operatorIdentities, operatorMemberships, people } from "@/db/schema";
import { issueSignedToken, readSignedToken } from "./signed-token";

export const OPERATOR_COOKIE = "rootlens_operator";
const THIRTY_DAYS = 30 * 24 * 60 * 60_000;

export function issueOperatorCookie(identityId: string, phoneLast4?: string): string {
  const authenticatedAt = Date.now();
  return issueSignedToken({ identityId, phoneLast4, authenticatedAt, expiresAt: authenticatedAt + THIRTY_DAYS });
}

function cookieValue(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const item of header.split(";")) {
    const [name, ...parts] = item.trim().split("=");
    if (name === OPERATOR_COOKIE) return decodeURIComponent(parts.join("="));
  }
  return null;
}

export function operatorIdentityId(request: Request): string | null {
  try {
    const value = readSignedToken(cookieValue(request) ?? "");
    return typeof value.identityId === "string" && typeof value.expiresAt === "number"
      && value.expiresAt > Date.now() ? value.identityId : null;
  } catch {
    return null;
  }
}

export function operatorPhoneHint(request: Request): string | null {
  try {
    const value = readSignedToken(cookieValue(request) ?? "");
    return typeof value.phoneLast4 === "string" && /^\d{4}$/.test(value.phoneLast4)
      && typeof value.expiresAt === "number" && value.expiresAt > Date.now() ? value.phoneLast4 : null;
  } catch {
    return null;
  }
}

export function operatorAuthenticatedAt(request: Request): number | null {
  try {
    const value = readSignedToken(cookieValue(request) ?? "");
    return typeof value.authenticatedAt === "number" && typeof value.expiresAt === "number"
      && value.expiresAt > Date.now() ? value.authenticatedAt : null;
  } catch {
    return null;
  }
}

export async function authenticateOperator(request: Request): Promise<string | null> {
  const identityId = operatorIdentityId(request);
  if (!identityId) return null;
  const [identity] = await db.select({ id: operatorIdentities.id }).from(operatorIdentities)
    .where(eq(operatorIdentities.id, identityId)).limit(1);
  return identity?.id ?? null;
}

export async function authenticateOperatorBrowser(request: Request, personId: string): Promise<boolean> {
  try {
    const identityId = await authenticateOperator(request);
    if (!identityId) return false;
    const rows = await db.select({ personId: people.id }).from(operatorMemberships)
      .innerJoin(people, eq(people.id, operatorMemberships.personId))
      .where(and(
        eq(operatorMemberships.identityId, identityId),
        eq(operatorMemberships.personId, personId),
        eq(people.status, "active"),
      )).limit(1);
    return rows.length === 1;
  } catch {
    return false;
  }
}
