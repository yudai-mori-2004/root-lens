import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { desktopAuthorizationCodes, desktopLoginRequests, operatorMemberships, people } from "@/db/schema";
import { randomToken, secureEqual } from "@/lib/desktop-auth-values";
import { sha256 } from "@/lib/encoding";
import { authenticateOperator, operatorAuthenticatedAt } from "@/lib/operator-browser";

const bodySchema = z.object({ requestId: z.string().min(1).max(100), state: z.string().min(32).max(200) });

export async function POST(request: Request) {
  const identityId = await authenticateOperator(request);
  if (!identityId) return Response.json({ error: "SMSログインが必要です。" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "接続要求を確認できません。" }, { status: 400 });
  const [attempt] = await db.select().from(desktopLoginRequests).where(and(
    eq(desktopLoginRequests.id, parsed.data.requestId),
    gt(desktopLoginRequests.expiresAt, new Date()),
    isNull(desktopLoginRequests.completedAt),
  )).limit(1);
  if (!attempt || !secureEqual(attempt.stateSha256, sha256(parsed.data.state))) {
    return Response.json({ error: "接続要求が無効か期限切れです。" }, { status: 410 });
  }
  if ((operatorAuthenticatedAt(request) ?? 0) < attempt.createdAt.getTime()) {
    return Response.json({ error: "このアプリへの接続にはSMS認証が必要です。" }, { status: 401 });
  }
  const memberships = await db.select({ id: people.id }).from(operatorMemberships)
    .innerJoin(people, eq(people.id, operatorMemberships.personId))
    .where(and(
      eq(operatorMemberships.identityId, identityId),
      eq(people.status, "active"),
      sql`${people.role} IN ('admin', 'supervisor')`,
    )).limit(1);
  if (!memberships.length) return Response.json({ error: "管理できる事業所がありません。" }, { status: 403 });
  const authorizationCode = randomToken();
  await db.transaction(async (transaction) => {
    const completed = await transaction.update(desktopLoginRequests).set({ completedAt: new Date() })
      .where(and(eq(desktopLoginRequests.id, attempt.id), isNull(desktopLoginRequests.completedAt)))
      .returning({ id: desktopLoginRequests.id });
    if (completed.length !== 1) throw new Error("login request already used");
    await transaction.insert(desktopAuthorizationCodes).values({
      id: `code_${randomUUID()}`,
      codeSha256: sha256(authorizationCode),
      identityId,
      codeChallenge: attempt.codeChallenge,
      expiresAt: new Date(Date.now() + 2 * 60_000),
    });
  });
  const redirect = new URL(attempt.redirectUri);
  redirect.searchParams.set("code", authorizationCode);
  redirect.searchParams.set("state", attempt.clientState);
  return Response.json({ redirectUrl: redirect.toString() });
}
