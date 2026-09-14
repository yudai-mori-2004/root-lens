import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { desktopSessions, operatorMemberships, people, sites } from "@/db/schema";
import { sha256 } from "./encoding";

function unauthorized(): Response {
  return Response.json({ error: "invalid or expired session" }, { status: 401 });
}

export type DesktopAuthentication =
  | { ok: true; identityId: string; personId: string; siteId: string }
  | { ok: false; response: Response };

export async function authenticateDesktop(request: Request): Promise<DesktopAuthentication> {
  const authorization = request.headers.get("authorization");
  const siteId = request.headers.get("x-rootlens-site-id");
  if (!authorization?.startsWith("Bearer ") || !siteId) return { ok: false, response: unauthorized() };
  const token = authorization.slice(7).trim();
  if (!token) return { ok: false, response: unauthorized() };
  const rows = await db.select({
    identityId: desktopSessions.identityId,
    personId: operatorMemberships.personId,
    siteId: people.siteId,
  }).from(desktopSessions)
    .innerJoin(operatorMemberships, eq(operatorMemberships.identityId, desktopSessions.identityId))
    .innerJoin(people, eq(people.id, operatorMemberships.personId))
    .innerJoin(sites, eq(sites.id, people.siteId))
    .where(and(
      eq(desktopSessions.tokenSha256, sha256(token)),
      gt(desktopSessions.expiresAt, new Date()),
      isNull(desktopSessions.revokedAt),
      eq(people.siteId, siteId),
      sql`${people.role} IN ('admin', 'supervisor')`,
      eq(people.status, "active"),
      eq(sites.status, "active"),
    )).limit(1);
  return rows[0] ? { ok: true, ...rows[0] } : { ok: false, response: unauthorized() };
}

export async function desktopSites(identityId: string) {
  return db.select({ id: sites.id, name: sites.name })
    .from(operatorMemberships)
    .innerJoin(people, eq(people.id, operatorMemberships.personId))
    .innerJoin(sites, eq(sites.id, people.siteId))
    .where(and(
      eq(operatorMemberships.identityId, identityId),
      sql`${people.role} IN ('admin', 'supervisor')`,
      eq(people.status, "active"),
      eq(sites.status, "active"),
    ));
}
