import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agreementRecords, operatorInvites, operatorMemberships, people } from "@/db/schema";
import { authenticateOperator } from "@/lib/operator-browser";
import { siteOperator } from "@/lib/site-membership";

export async function GET(request: Request, context: { params: Promise<{ siteId: string }> }) {
  const identityId = await authenticateOperator(request);
  const { siteId } = await context.params;
  const operator = identityId ? await siteOperator(identityId, siteId) : null;
  if (!operator) return Response.json({ error: "この事業所を管理する権限がありません。" }, { status: 403 });
  const members = await db.select({
    id: people.id,
    name: people.name,
    role: people.role,
    identityId: operatorMemberships.identityId,
    inviteId: operatorInvites.id,
    inviteAcceptedAt: operatorInvites.acceptedAt,
    consentId: agreementRecords.id,
    consentSignedAt: agreementRecords.signedAt,
  }).from(people)
    .leftJoin(operatorMemberships, eq(operatorMemberships.personId, people.id))
    .leftJoin(operatorInvites, eq(operatorInvites.personId, people.id))
    .leftJoin(agreementRecords, and(
      eq(agreementRecords.personId, people.id),
      eq(agreementRecords.kind, "staff_consent"),
      eq(agreementRecords.status, "active"),
    ))
    .where(and(eq(people.siteId, siteId), eq(people.status, "active")))
    .orderBy(desc(people.createdAt));
  return Response.json({ site: { id: siteId, name: operator.siteName, role: operator.role, personId: operator.personId }, members });
}
