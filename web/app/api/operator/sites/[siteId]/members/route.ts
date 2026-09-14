import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db/client";
import { operatorInvites, people } from "@/db/schema";
import { randomToken } from "@/lib/desktop-auth-values";
import { sha256 } from "@/lib/encoding";
import { authenticateOperator } from "@/lib/operator-browser";
import { siteOperator } from "@/lib/site-membership";

const bodySchema = z.object({ name: z.string().trim().min(1).max(100) });

export async function POST(request: Request, context: { params: Promise<{ siteId: string }> }) {
  const identityId = await authenticateOperator(request);
  const { siteId } = await context.params;
  const operator = identityId ? await siteOperator(identityId, siteId) : null;
  if (!operator) return Response.json({ error: "この操作を行う権限がありません。" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "スタッフの氏名を入力してください。" }, { status: 400 });
  const personId = `person_${randomUUID()}`;
  const inviteId = `invite_${randomUUID()}`;
  const token = randomToken();
  await db.transaction(async (transaction) => {
    await transaction.insert(people).values({
      id: personId,
      organizationId: operator.organizationId,
      siteId,
      name: parsed.data.name,
      role: "staff",
    });
    await transaction.insert(operatorInvites).values({
      id: inviteId,
      personId,
      tokenSha256: sha256(token),
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60_000),
    });
  });
  const origin = new URL(request.url).origin;
  return Response.json({ personId, inviteUrl: `${origin}/invite/${token}` }, { status: 201 });
}
