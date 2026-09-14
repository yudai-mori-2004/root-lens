import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { operatorMemberships, people, sites } from "@/db/schema";

export type SiteRole = "staff" | "admin" | "supervisor";

export async function siteOperator(identityId: string, siteId: string) {
  const [row] = await db.select({
    personId: people.id,
    role: people.role,
    siteName: sites.name,
    organizationId: sites.organizationId,
  }).from(operatorMemberships)
    .innerJoin(people, eq(people.id, operatorMemberships.personId))
    .innerJoin(sites, eq(sites.id, people.siteId))
    .where(and(
      eq(operatorMemberships.identityId, identityId),
      eq(people.siteId, siteId),
      eq(people.status, "active"),
      eq(sites.status, "active"),
    )).limit(1);
  return row && (row.role === "admin" || row.role === "supervisor")
    ? { ...row, role: row.role as "admin" | "supervisor" } : null;
}
