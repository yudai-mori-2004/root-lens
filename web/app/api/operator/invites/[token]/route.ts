import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { operatorInvites, people, sites } from "@/db/schema";
import { sha256 } from "@/lib/encoding";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const [invite] = await db.select({
    personId: people.id,
    personName: people.name,
    siteName: sites.name,
    expiresAt: operatorInvites.expiresAt,
  }).from(operatorInvites)
    .innerJoin(people, eq(people.id, operatorInvites.personId))
    .innerJoin(sites, eq(sites.id, people.siteId))
    .where(and(
      eq(operatorInvites.tokenSha256, sha256(token)),
      gt(operatorInvites.expiresAt, new Date()),
      isNull(operatorInvites.acceptedAt),
    )).limit(1);
  return invite ? Response.json(invite) : Response.json({ error: "招待リンクが無効か期限切れです。" }, { status: 410 });
}
