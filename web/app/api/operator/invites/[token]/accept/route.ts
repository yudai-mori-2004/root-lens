import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { operatorInvites, operatorMemberships, people, sites } from "@/db/schema";
import { storeAgreementOriginal, activateAgreement } from "@/lib/agreement-service";
import { sha256 } from "@/lib/encoding";
import { operatorPhoneLast4 } from "@/lib/operator-identity";
import { authenticateOperator } from "@/lib/operator-browser";
import { siteDrive } from "@/lib/site-drive";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const identityId = await authenticateOperator(request);
  if (!identityId) return Response.json({ error: "SMSログインが必要です。" }, { status: 401 });
  const { token } = await context.params;
  const [invite] = await db.select({
    id: operatorInvites.id,
    personId: people.id,
    personName: people.name,
    siteId: sites.id,
  }).from(operatorInvites)
    .innerJoin(people, eq(people.id, operatorInvites.personId))
    .innerJoin(sites, eq(sites.id, people.siteId))
    .where(and(
      eq(operatorInvites.tokenSha256, sha256(token)),
      gt(operatorInvites.expiresAt, new Date()),
      isNull(operatorInvites.acceptedAt),
    )).limit(1);
  if (!invite) return Response.json({ error: "招待リンクが無効か期限切れです。" }, { status: 410 });
  const [existingMembership] = await db.select({ personId: people.id })
    .from(operatorMemberships)
    .innerJoin(people, eq(people.id, operatorMemberships.personId))
    .where(and(
      eq(operatorMemberships.identityId, identityId),
      eq(people.siteId, invite.siteId),
      eq(people.status, "active"),
    )).limit(1);
  if (existingMembership) {
    return Response.json({ error: "この電話番号はすでに事業所へ登録されています。" }, { status: 409 });
  }
  try {
    const phoneLast4 = await operatorPhoneLast4(identityId);
    const { site, drive } = await siteDrive(invite.siteId);
    const agreement = await storeAgreementOriginal({
      site, drive, kind: "staff_consent", personId: invite.personId, identityId,
      signerName: invite.personName, phoneLast4,
    });
    await activateAgreement(agreement);
    await db.transaction(async (transaction) => {
      await transaction.insert(operatorMemberships).values({ identityId, personId: invite.personId }).onConflictDoNothing();
      await transaction.update(operatorInvites).set({ acceptedAt: new Date() })
        .where(and(eq(operatorInvites.id, invite.id), isNull(operatorInvites.acceptedAt)));
    });
    return Response.json({ accepted: true, siteId: invite.siteId });
  } catch {
    return Response.json({ error: "同意を保存できませんでした。再度お試しください。" }, { status: 500 });
  }
}
