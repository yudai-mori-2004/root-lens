import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { people } from "@/db/schema";
import { authenticateOperator } from "@/lib/operator-browser";
import { siteOperator, type SiteRole } from "@/lib/site-membership";

const bodySchema = z.object({ role: z.enum(["staff", "admin", "supervisor"]) });

export async function PATCH(request: Request, context: { params: Promise<{ siteId: string; personId: string }> }) {
  const identityId = await authenticateOperator(request);
  const { siteId, personId } = await context.params;
  const operator = identityId ? await siteOperator(identityId, siteId) : null;
  if (!operator) return Response.json({ error: "この操作を行う権限がありません。" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "権限を確認してください。" }, { status: 400 });
  const [target] = await db.select().from(people).where(and(eq(people.id, personId), eq(people.siteId, siteId))).limit(1);
  if (!target) return Response.json({ error: "スタッフが見つかりません。" }, { status: 404 });
  const nextRole = parsed.data.role as SiteRole;
  if (operator.role !== "supervisor" && (target.role === "supervisor" || nextRole === "supervisor")) {
    return Response.json({ error: "現場監督者の権限は現場監督者のみ変更できます。" }, { status: 403 });
  }
  await db.update(people).set({ role: nextRole }).where(eq(people.id, personId));
  return Response.json({ personId, role: nextRole });
}
