import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agreementRecords, operatorInvites, operatorMemberships, people, sites } from "@/db/schema";
import { authenticateOperator } from "@/lib/operator-browser";
import type { SiteRole } from "@/lib/site-membership";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  jobTitle: z.string().trim().max(100),
  note: z.string().trim().max(1000),
  role: z.enum(["staff", "admin", "supervisor"]),
});

export async function PATCH(request: Request, context: { params: Promise<{ siteId: string; personId: string }> }) {
  const identityId = await authenticateOperator(request);
  const { siteId, personId } = await context.params;
  if (!identityId) return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "プロフィールを確認してください。" }, { status: 400 });
  const nextRole = parsed.data.role as SiteRole;
  return db.transaction(async (transaction) => {
    const [site] = await transaction.select({ id: sites.id }).from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.status, "active"))).for("update");
    if (!site) return Response.json({ error: "事業所が見つかりません。" }, { status: 404 });

    const [operator] = await transaction.select({ role: people.role }).from(operatorMemberships)
      .innerJoin(people, eq(people.id, operatorMemberships.personId))
      .where(and(eq(operatorMemberships.identityId, identityId), eq(people.siteId, siteId),
        eq(people.status, "active"), sql`${people.role} IN ('admin', 'supervisor')`)).limit(1);
    if (!operator) return Response.json({ error: "この操作を行う権限がありません。" }, { status: 403 });

    const [target] = await transaction.select().from(people)
      .where(and(eq(people.id, personId), eq(people.siteId, siteId), eq(people.status, "active"))).limit(1);
    if (!target) return Response.json({ error: "スタッフが見つかりません。" }, { status: 404 });
    if (operator.role !== "supervisor" && nextRole !== target.role && (target.role === "supervisor" || nextRole === "supervisor")) {
      return Response.json({ error: "現場監督者の権限は現場監督者のみ変更できます。" }, { status: 403 });
    }
    if (target.role === "supervisor" && nextRole !== "supervisor") {
      const supervisors = await transaction.select({ id: people.id }).from(people)
        .innerJoin(operatorMemberships, eq(operatorMemberships.personId, people.id))
        .where(and(eq(people.siteId, siteId), eq(people.status, "active"), eq(people.role, "supervisor")));
      if (supervisors.some((supervisor) => supervisor.id === personId) && supervisors.length <= 1) {
        return Response.json({ error: "最後の現場監督者は降格できません。先に別のスタッフを現場監督者にしてください。" }, { status: 409 });
      }
    }
    await transaction.update(people).set({
      name: parsed.data.name,
      jobTitle: parsed.data.jobTitle || null,
      note: parsed.data.note || null,
      role: nextRole,
    }).where(eq(people.id, personId));
    return Response.json({ personId, role: nextRole });
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ siteId: string; personId: string }> }) {
  const identityId = await authenticateOperator(request);
  const { siteId, personId } = await context.params;
  if (!identityId) return Response.json({ error: "ログインが必要です。" }, { status: 401 });
  return db.transaction(async (transaction) => {
    const [site] = await transaction.select({ id: sites.id }).from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.status, "active"))).for("update");
    if (!site) return Response.json({ error: "事業所が見つかりません。" }, { status: 404 });
    const [operator] = await transaction.select({ role: people.role }).from(operatorMemberships)
      .innerJoin(people, eq(people.id, operatorMemberships.personId))
      .where(and(eq(operatorMemberships.identityId, identityId), eq(people.siteId, siteId),
        eq(people.status, "active"), sql`${people.role} IN ('admin', 'supervisor')`)).limit(1);
    if (!operator) return Response.json({ error: "この操作を行う権限がありません。" }, { status: 403 });
    const [target] = await transaction.select({ role: people.role }).from(people)
      .where(and(eq(people.id, personId), eq(people.siteId, siteId), eq(people.status, "active"))).limit(1);
    if (!target) return Response.json({ error: "スタッフが見つかりません。" }, { status: 404 });
    if (target.role === "supervisor") {
      if (operator.role !== "supervisor") return Response.json({ error: "現場監督者は現場監督者のみ削除できます。" }, { status: 403 });
      const supervisors = await transaction.select({ id: people.id }).from(people)
        .innerJoin(operatorMemberships, eq(operatorMemberships.personId, people.id))
        .where(and(eq(people.siteId, siteId), eq(people.status, "active"), eq(people.role, "supervisor")));
      if (supervisors.length <= 1) return Response.json({ error: "最後の現場監督者は削除できません。" }, { status: 409 });
    }
    await transaction.update(people).set({ status: "removed" }).where(eq(people.id, personId));
    await transaction.update(agreementRecords).set({ status: "revoked" }).where(and(
      eq(agreementRecords.personId, personId), eq(agreementRecords.kind, "staff_consent"), eq(agreementRecords.status, "active"),
    ));
    await transaction.delete(operatorInvites).where(eq(operatorInvites.personId, personId));
    return Response.json({ removed: true });
  });
}
