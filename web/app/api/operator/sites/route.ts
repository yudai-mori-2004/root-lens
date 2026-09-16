import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agreementRecords, operatorMemberships, people, siteRegistrationAttempts, sites } from "@/db/schema";
import { storeAgreementOriginal } from "@/lib/agreement-service";
import { GoogleDriveClient } from "@/lib/google-drive";
import { googleDriveSession } from "@/lib/google-drive-session";
import { operatorPhoneLast4 } from "@/lib/operator-identity";
import { authenticateOperator } from "@/lib/operator-browser";
import { managedSites } from "@/lib/operator-data";
import { provisionSiteDrive } from "@/lib/site-provisioning";

const LEASE_MS = 5 * 60_000;

const bodySchema = z.object({
  requestId: z.string().uuid(),
  siteName: z.string().trim().min(1).max(200),
  signerName: z.string().trim().min(1).max(100),
  agreed: z.literal(true),
});

export async function GET(request: Request) {
  const identityId = await authenticateOperator(request);
  if (!identityId) return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  const rows = await managedSites(identityId);
  return Response.json({ sites: rows });
}

export async function POST(request: Request) {
  const identityId = await authenticateOperator(request);
  if (!identityId) return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "事業所名、氏名、同意内容を確認してください。" }, { status: 400 });

  let claimId: string | undefined;
  try {
    const { requestId, siteName, signerName } = parsed.data;
    const phoneLast4 = await operatorPhoneLast4(identityId);
    const drive = new GoogleDriveClient(await googleDriveSession());
    const previous = await db.select({ requestId: siteRegistrationAttempts.requestId })
      .from(siteRegistrationAttempts).where(eq(siteRegistrationAttempts.requestId, requestId)).limit(1);
    if (!previous.length) {
      const [rootFolderId, siteAgreementsFolderId, staffConsentsFolderId, approvedDataFolderId,
        siteAgreementFileId, staffConsentFileId] = await Promise.all(Array.from({ length: 6 }, () => drive.generateId()));
      await db.insert(siteRegistrationAttempts).values({
        requestId, identityId, siteId: `site_${randomUUID()}`, personId: `person_${randomUUID()}`,
        siteName, signerName, phoneLast4, acceptedAt: new Date(), rootFolderId, siteAgreementsFolderId,
        staffConsentsFolderId, approvedDataFolderId, siteAgreementId: `agr_${randomUUID()}`,
        siteAgreementFileId, staffConsentId: `agr_${randomUUID()}`, staffConsentFileId,
      }).onConflictDoNothing();
    }

    claimId = randomUUID();
    const owner = claimId;
    const claimed = await db.transaction(async (tx) => {
      const [attempt] = await tx.select().from(siteRegistrationAttempts)
        .where(eq(siteRegistrationAttempts.requestId, requestId)).for("update").limit(1);
      if (!attempt || attempt.identityId !== identityId || attempt.siteName !== siteName || attempt.signerName !== signerName)
        return { state: "conflict" as const };
      if (attempt.completedAt) return { state: "completed" as const, siteId: attempt.siteId };
      const now = new Date();
      if (attempt.processingOwner && attempt.processingStartedAt
        && attempt.processingStartedAt.getTime() > now.getTime() - LEASE_MS)
        return { state: "busy" as const };
      await tx.update(siteRegistrationAttempts).set({ processingOwner: owner, processingStartedAt: now })
        .where(eq(siteRegistrationAttempts.requestId, requestId));
      return { state: "claimed" as const, attempt };
    });
    if (claimed.state === "completed") return Response.json({ siteId: claimed.siteId });
    if (claimed.state === "conflict") return Response.json({ error: "この登録操作は別の内容に使われています。" }, { status: 409 });
    if (claimed.state === "busy") return Response.json({ error: "登録処理中です。少し待ってから再度お試しください。" }, { status: 409 });

    const attempt = claimed.attempt;
    const provisioned = await provisionSiteDrive(siteName, {
      siteId: attempt.siteId, rootFolderId: attempt.rootFolderId,
      siteAgreementsFolderId: attempt.siteAgreementsFolderId,
      staffConsentsFolderId: attempt.staffConsentsFolderId,
      approvedDataFolderId: attempt.approvedDataFolderId,
    }, drive);
    const site = {
      id: attempt.siteId, name: siteName, sharedDriveId: provisioned.sharedDriveId,
      siteAgreementsFolderId: attempt.siteAgreementsFolderId,
      staffConsentsFolderId: attempt.staffConsentsFolderId,
    };
    const siteAgreement = await storeAgreementOriginal({
      site, drive, kind: "site_agreement", identityId, signerName, phoneLast4: attempt.phoneLast4,
      acceptedAt: attempt.acceptedAt, agreementId: attempt.siteAgreementId,
      driveFileId: attempt.siteAgreementFileId,
    });
    const staffConsent = await storeAgreementOriginal({
      site, drive, kind: "staff_consent", personId: attempt.personId, identityId,
      signerName, phoneLast4: attempt.phoneLast4, acceptedAt: attempt.acceptedAt,
      agreementId: attempt.staffConsentId, driveFileId: attempt.staffConsentFileId,
    });

    await db.transaction(async (tx) => {
      const [current] = await tx.select({ processingOwner: siteRegistrationAttempts.processingOwner,
        completedAt: siteRegistrationAttempts.completedAt })
        .from(siteRegistrationAttempts).where(eq(siteRegistrationAttempts.requestId, requestId)).for("update");
      if (!current || current.processingOwner !== owner || current.completedAt)
        throw new Error("Site registration claim was lost");
      await tx.insert(sites).values({
        id: attempt.siteId, name: siteName, sharedDriveId: provisioned.sharedDriveId,
        rootFolderId: attempt.rootFolderId, siteAgreementsFolderId: attempt.siteAgreementsFolderId,
        staffConsentsFolderId: attempt.staffConsentsFolderId,
        approvedDataFolderId: attempt.approvedDataFolderId,
      });
      await tx.insert(people).values({
        id: attempt.personId, siteId: attempt.siteId, name: signerName, role: "supervisor",
      });
      await tx.insert(operatorMemberships).values({ identityId, personId: attempt.personId });
      await tx.insert(agreementRecords).values([siteAgreement, staffConsent]);
      await tx.update(siteRegistrationAttempts).set({ completedAt: new Date(), processingOwner: null,
        processingStartedAt: null }).where(eq(siteRegistrationAttempts.requestId, requestId));
    });
    return Response.json({ siteId: attempt.siteId }, { status: 201 });
  } catch (error) {
    console.error("site registration failed", error);
    if (claimId) await db.update(siteRegistrationAttempts).set({ processingOwner: null, processingStartedAt: null })
      .where(and(eq(siteRegistrationAttempts.requestId, parsed.data.requestId),
        eq(siteRegistrationAttempts.processingOwner, claimId)));
    return Response.json({ error: "事業所を登録できませんでした。同じ内容で再度お試しください。" }, { status: 500 });
  }
}
