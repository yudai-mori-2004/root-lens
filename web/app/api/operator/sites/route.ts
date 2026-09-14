import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agreementRecords, operatorMemberships, people, sites } from "@/db/schema";
import { storeAgreementOriginal } from "@/lib/agreement-service";
import { operatorPhoneLast4 } from "@/lib/operator-identity";
import { authenticateOperator } from "@/lib/operator-browser";
import { provisionSiteDrive } from "@/lib/site-provisioning";

const bodySchema = z.object({
  siteName: z.string().trim().min(1).max(200),
  signerName: z.string().trim().min(1).max(100),
  agreed: z.literal(true),
});

export async function GET(request: Request) {
  const identityId = await authenticateOperator(request);
  if (!identityId) return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  const rows = await db.select({ id: sites.id, name: sites.name, role: people.role })
    .from(operatorMemberships)
    .innerJoin(people, eq(people.id, operatorMemberships.personId))
    .innerJoin(sites, eq(sites.id, people.siteId))
    .where(and(
      eq(operatorMemberships.identityId, identityId),
      eq(people.status, "active"),
      eq(sites.status, "active"),
      sql`${people.role} IN ('admin', 'supervisor')`,
    ));
  return Response.json({ sites: rows });
}

export async function POST(request: Request) {
  const identityId = await authenticateOperator(request);
  if (!identityId) return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "事業所名、氏名、同意内容を確認してください。" }, { status: 400 });
  try {
    const phoneLast4 = await operatorPhoneLast4(identityId);
    const provisioned = await provisionSiteDrive(parsed.data.siteName);
    const personId = `person_${randomUUID()}`;
    const site = {
      id: provisioned.siteId,
      name: parsed.data.siteName,
      sharedDriveId: provisioned.sharedDriveId,
      siteAgreementsFolderId: provisioned.siteAgreementsFolderId,
      staffConsentsFolderId: provisioned.staffConsentsFolderId,
    };
    const acceptedAt = new Date();
    const siteAgreement = await storeAgreementOriginal({
      site, drive: provisioned.drive, kind: "site_agreement", identityId,
      signerName: parsed.data.signerName, phoneLast4, acceptedAt,
    });
    const staffConsent = await storeAgreementOriginal({
      site, drive: provisioned.drive, kind: "staff_consent", personId, identityId,
      signerName: parsed.data.signerName, phoneLast4, acceptedAt,
    });
    await db.transaction(async (transaction) => {
      await transaction.insert(sites).values({
        id: provisioned.siteId,
        name: parsed.data.siteName,
        sharedDriveId: provisioned.sharedDriveId,
        rootFolderId: provisioned.rootFolderId,
        siteAgreementsFolderId: provisioned.siteAgreementsFolderId,
        staffConsentsFolderId: provisioned.staffConsentsFolderId,
        approvedDataFolderId: provisioned.approvedDataFolderId,
      });
      await transaction.insert(people).values({
        id: personId, siteId: provisioned.siteId,
        name: parsed.data.signerName, role: "supervisor",
      });
      await transaction.insert(operatorMemberships).values({ identityId, personId });
      await transaction.insert(agreementRecords).values([siteAgreement, staffConsent]);
    });
    return Response.json({ siteId: provisioned.siteId }, { status: 201 });
  } catch (error) {
    console.error("site registration failed", error);
    return Response.json({ error: "事業所を登録できませんでした。時間をおいて再度お試しください。" }, { status: 500 });
  }
}
