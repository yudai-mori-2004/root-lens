import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { operatorMemberships, people, sites } from "@/db/schema";
import { authenticateOperator } from "@/lib/operator-browser";
import { managedSite } from "@/lib/operator-data";

export async function GET(request: Request, context: { params: Promise<{ siteId: string }> }) {
  const identityId = await authenticateOperator(request);
  const { siteId } = await context.params;
  const data = identityId ? await managedSite(identityId, siteId) : null;
  if (!data) return Response.json({ error: "この事業所を管理する権限がありません。" }, { status: 403 });
  return Response.json(data);
}

export async function DELETE(request: Request, context: { params: Promise<{ siteId: string }> }) {
  const identityId = await authenticateOperator(request);
  if (!identityId) return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  const { siteId } = await context.params;
  return db.transaction(async (transaction) => {
    const [site] = await transaction.select({ id: sites.id }).from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.status, "active"))).for("update");
    if (!site) return Response.json({ error: "事業所が見つかりません。" }, { status: 404 });
    const [supervisor] = await transaction.select({ id: people.id }).from(operatorMemberships)
      .innerJoin(people, eq(people.id, operatorMemberships.personId))
      .where(and(eq(operatorMemberships.identityId, identityId), eq(people.siteId, siteId),
        eq(people.status, "active"), eq(people.role, "supervisor"))).limit(1);
    if (!supervisor) return Response.json({ error: "現場監督者のみ事業所を削除できます。" }, { status: 403 });
    await transaction.update(sites).set({ status: "removed" }).where(eq(sites.id, siteId));
    return Response.json({ removed: true });
  });
}
