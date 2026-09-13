import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { operatorMemberships, people } from "@/db/schema";
import { issueSignedToken, readSignedToken } from "./signed-token";

export const OPERATOR_COOKIE = "rootlens_operator";
const THIRTY_DAYS = 30 * 24 * 60 * 60_000;

export function issueOperatorCookie(identityId: string): string {
  return issueSignedToken({ identityId, expiresAt: Date.now() + THIRTY_DAYS });
}

function cookieValue(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const item of header.split(";")) {
    const [name, ...parts] = item.trim().split("=");
    if (name === OPERATOR_COOKIE) return decodeURIComponent(parts.join("="));
  }
  return null;
}

export async function authenticateOperatorBrowser(request: Request, personId: string): Promise<boolean> {
  try {
    const value = readSignedToken(cookieValue(request) ?? "");
    if (typeof value.identityId !== "string" || typeof value.expiresAt !== "number"
        || value.expiresAt <= Date.now()) return false;
    const rows = await db.select({ personId: people.id }).from(operatorMemberships)
      .innerJoin(people, eq(people.id, operatorMemberships.personId))
      .where(and(
        eq(operatorMemberships.identityId, value.identityId),
        eq(operatorMemberships.personId, personId),
        eq(people.status, "active"),
      )).limit(1);
    return rows.length === 1;
  } catch {
    return false;
  }
}
