import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { agreementRecords, operatorMemberships, people, sites } from "@/db/schema";
import { siteOperator } from "@/lib/site-membership";

export async function managedSites(identityId: string) {
  return db.select({ id: sites.id, name: sites.name, role: people.role })
    .from(operatorMemberships)
    .innerJoin(people, eq(people.id, operatorMemberships.personId))
    .innerJoin(sites, eq(sites.id, people.siteId))
    .where(and(eq(operatorMemberships.identityId, identityId), eq(people.status, "active"),
      eq(sites.status, "active"), sql`${people.role} IN ('admin', 'supervisor')`));
}

export async function managedSite(identityId: string, siteId: string) {
  const [operator, members] = await Promise.all([
    siteOperator(identityId, siteId),
    db.select({
      id: people.id, name: people.name, jobTitle: people.jobTitle, note: people.note,
      createdAt: people.createdAt, role: people.role, identityId: operatorMemberships.identityId,
      consentId: agreementRecords.id, consentSignedAt: agreementRecords.signedAt,
      phoneLast4: agreementRecords.phoneLast4,
    }).from(people)
      .leftJoin(operatorMemberships, eq(operatorMemberships.personId, people.id))
      .leftJoin(agreementRecords, and(eq(agreementRecords.personId, people.id),
        eq(agreementRecords.kind, "staff_consent"), eq(agreementRecords.status, "active")))
      .where(and(eq(people.siteId, siteId), eq(people.status, "active")))
      .orderBy(desc(people.createdAt)),
  ]);
  if (!operator) return null;
  return {
    site: { id: siteId, name: operator.siteName, role: operator.role, personId: operator.personId },
    members: members.map((member) => ({
      ...member, createdAt: member.createdAt.toISOString(),
      consentSignedAt: member.consentSignedAt?.toISOString() ?? null,
    })),
  };
}

export type ManagedSiteData = NonNullable<Awaited<ReturnType<typeof managedSite>>>;
