import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { operatorInvites, people, sites } from "@/db/schema";
import { sha256 } from "@/lib/encoding";
import { authenticateOperator } from "@/lib/operator-browser";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const [invite] = await db.select({
    personId: people.id,
    personName: people.name,
    siteName: sites.name,
    expiresAt: operatorInvites.expiresAt,
    acceptedAt: operatorInvites.acceptedAt,
    acceptanceIdentityId: operatorInvites.acceptanceIdentityId,
  }).from(operatorInvites)
    .innerJoin(people, eq(people.id, operatorInvites.personId))
    .innerJoin(sites, eq(sites.id, people.siteId))
    .where(and(eq(operatorInvites.tokenSha256, sha256(token)),
      eq(people.status, "active"), eq(sites.status, "active"))).limit(1);
  if (!invite) return Response.json({ error: "招待リンクが無効か期限切れです。" }, { status: 410 });
  if (invite.acceptedAt) {
    const identityId = await authenticateOperator(request);
    return identityId === invite.acceptanceIdentityId
      ? Response.json({ accepted: true })
      : Response.json({ error: "この招待は使用済みです。" }, { status: 410 });
  }
  return invite.expiresAt > new Date()
    ? Response.json({ personName: invite.personName, siteName: invite.siteName })
    : Response.json({ error: "招待リンクが無効か期限切れです。" }, { status: 410 });
}
