import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agreementRecords, operatorInvites, operatorMemberships, people, sites } from "@/db/schema";
import { storeAgreementOriginal } from "@/lib/agreement-service";
import { sha256 } from "@/lib/encoding";
import { operatorPhoneLast4 } from "@/lib/operator-identity";
import { authenticateOperator } from "@/lib/operator-browser";
import { siteDrive } from "@/lib/site-drive";

const LEASE_MS = 5 * 60_000;

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const identityId = await authenticateOperator(request);
  if (!identityId) return Response.json({ error: "SMSログインが必要です。" }, { status: 401 });
  const body = z.object({ agreed: z.literal(true) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "本文書を確認し、同意してから進んでください。" }, { status: 400 });

  const { token } = await context.params;
  const phoneLast4 = await operatorPhoneLast4(identityId);
  const claimId = randomUUID();
  const now = new Date();
  const claim = await db.transaction(async (tx) => {
    const [invite] = await tx.select().from(operatorInvites)
      .where(eq(operatorInvites.tokenSha256, sha256(token))).for("update").limit(1);
    if (!invite) return { state: "expired" as const };
    const [person] = await tx.select({ id: people.id, name: people.name, siteId: people.siteId })
      .from(people).innerJoin(sites, eq(sites.id, people.siteId))
      .where(and(eq(people.id, invite.personId), eq(people.status, "active"), eq(sites.status, "active"))).limit(1);
    if (!person) return { state: "expired" as const };
    if (invite.acceptedAt) return invite.acceptanceIdentityId === identityId
      ? { state: "accepted" as const, siteId: person.siteId } : { state: "expired" as const };
    if (invite.expiresAt <= now) return { state: "expired" as const };
    if (invite.acceptanceIdentityId && invite.acceptanceIdentityId !== identityId)
      return { state: "other_account" as const };
    if (invite.processingOwner && invite.processingStartedAt
      && invite.processingStartedAt.getTime() > now.getTime() - LEASE_MS)
      return { state: "busy" as const };
    const [membership] = await tx.select({ id: people.id }).from(operatorMemberships)
      .innerJoin(people, eq(people.id, operatorMemberships.personId))
      .where(and(eq(operatorMemberships.identityId, identityId), eq(people.siteId, person.siteId),
        eq(people.status, "active"))).limit(1);
    if (membership) return { state: "already_member" as const };
    const agreementId = invite.acceptanceRecordId ?? `agr_${randomUUID()}`;
    const acceptedAt = invite.acceptanceStartedAt ?? now;
    await tx.update(operatorInvites).set({
      processingOwner: claimId, processingStartedAt: now, acceptanceIdentityId: identityId,
      acceptanceRecordId: agreementId, acceptanceStartedAt: acceptedAt,
      acceptancePhoneLast4: invite.acceptancePhoneLast4 ?? phoneLast4,
      acceptanceSignerName: invite.acceptanceSignerName ?? person.name,
    }).where(eq(operatorInvites.id, invite.id));
    return { state: "claimed" as const, inviteId: invite.id, person, agreementId,
      driveFileId: invite.acceptanceFileId, acceptedAt,
      signerName: invite.acceptanceSignerName ?? person.name,
      phoneLast4: invite.acceptancePhoneLast4 ?? phoneLast4 };
  });

  if (claim.state === "accepted") return Response.json({ accepted: true, siteId: claim.siteId });
  if (claim.state === "expired") return Response.json({ error: "招待リンクが無効か期限切れです。" }, { status: 410 });
  if (claim.state === "other_account") return Response.json({ error: "この招待は別のSMSアカウントで進行中です。" }, { status: 409 });
  if (claim.state === "already_member") return Response.json({ error: "この電話番号はすでに事業所へ登録されています。" }, { status: 409 });
  if (claim.state === "busy") return Response.json({ error: "同意を保存中です。少し待ってから再度お試しください。" }, { status: 409 });

  try {
    const { site, drive } = await siteDrive(claim.person.siteId);
    const fileId = claim.driveFileId ?? await drive.generateId();
    if (!claim.driveFileId) {
      const updated = await db.update(operatorInvites).set({ acceptanceFileId: fileId })
        .where(and(eq(operatorInvites.id, claim.inviteId), eq(operatorInvites.processingOwner, claimId)))
        .returning({ id: operatorInvites.id });
      if (updated.length !== 1) throw new Error("Invitation claim was lost");
    }
    const agreement = await storeAgreementOriginal({
      site, drive, kind: "staff_consent", personId: claim.person.id, identityId,
      signerName: claim.signerName, phoneLast4: claim.phoneLast4, agreementId: claim.agreementId,
      driveFileId: fileId, acceptedAt: claim.acceptedAt,
    });
    await db.transaction(async (tx) => {
      const [invite] = await tx.select().from(operatorInvites)
        .where(eq(operatorInvites.id, claim.inviteId)).for("update").limit(1);
      if (!invite || invite.processingOwner !== claimId || invite.acceptedAt)
        throw new Error("Invitation claim was lost");
      const [activeSite] = await tx.select({ id: sites.id }).from(sites)
        .where(and(eq(sites.id, site.id), eq(sites.status, "active"))).for("update");
      const [activePerson] = await tx.select({ id: people.id }).from(people)
        .where(and(eq(people.id, claim.person.id), eq(people.status, "active"))).limit(1);
      if (!activeSite || !activePerson)
        throw new Error("Invitation is no longer active");
      const [membership] = await tx.select({ id: people.id }).from(operatorMemberships)
        .innerJoin(people, eq(people.id, operatorMemberships.personId))
        .where(and(eq(operatorMemberships.identityId, identityId), eq(people.siteId, site.id),
          eq(people.status, "active"))).limit(1);
      if (membership) throw new Error("Account already belongs to this site");
      await tx.update(agreementRecords).set({ status: "superseded" }).where(and(
        eq(agreementRecords.personId, claim.person.id), eq(agreementRecords.kind, "staff_consent"),
        eq(agreementRecords.status, "active"), ne(agreementRecords.id, agreement.id),
      ));
      await tx.insert(agreementRecords).values(agreement);
      await tx.insert(operatorMemberships).values({ identityId, personId: claim.person.id });
      await tx.update(operatorInvites).set({ acceptedAt: new Date(), processingOwner: null,
        processingStartedAt: null }).where(eq(operatorInvites.id, claim.inviteId));
    });
    return Response.json({ accepted: true, siteId: site.id });
  } catch (error) {
    console.error("staff consent acceptance failed", error);
    await db.update(operatorInvites).set({ processingOwner: null, processingStartedAt: null })
      .where(and(eq(operatorInvites.id, claim.inviteId), eq(operatorInvites.processingOwner, claimId)));
    return Response.json({ error: "同意を保存できませんでした。同じリンクから再度お試しください。" }, { status: 500 });
  }
}
