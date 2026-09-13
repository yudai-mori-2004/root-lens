import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { operatorInvites, people, sites } from "@/db/schema";
import { emailSha256 } from "@/lib/desktop-auth-values";
import { authenticateInternalRequest } from "@/lib/internal-auth";

const bodySchema = z.object({ email: z.string().email() });

export async function POST(request: Request, context: { params: Promise<{ siteId: string }> }) {
  const unauthorized = authenticateInternalRequest(request);
  if (unauthorized) return unauthorized;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid supervisor" }, { status: 400 });
  const { siteId } = await context.params;
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return Response.json({ error: "site not found" }, { status: 404 });
  const emailDigest = emailSha256(parsed.data.email);
  const [existing] = await db.select({
    personId: people.id,
    inviteId: operatorInvites.id,
    acceptedAt: operatorInvites.acceptedAt,
    expiresAt: operatorInvites.expiresAt,
  }).from(operatorInvites)
    .innerJoin(people, eq(people.id, operatorInvites.personId))
    .where(and(
      eq(operatorInvites.emailSha256, emailDigest),
      eq(people.siteId, site.id),
      eq(people.role, "supervisor"),
      eq(people.status, "active"),
    ))
    .orderBy(desc(operatorInvites.createdAt))
    .limit(1);
  if (existing) {
    if (!existing.acceptedAt && existing.expiresAt <= new Date()) {
      await db.update(operatorInvites).set({ expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) })
        .where(eq(operatorInvites.id, existing.inviteId));
    }
    return Response.json({
      personId: existing.personId,
      inviteId: existing.inviteId,
      siteId,
      accepted: existing.acceptedAt !== null,
    });
  }
  const personId = `person_${randomUUID()}`;
  const inviteId = `invite_${randomUUID()}`;
  await db.transaction(async (transaction) => {
    await transaction.insert(people).values({
      id: personId,
      organizationId: site.organizationId,
      siteId: site.id,
      role: "supervisor",
    });
    await transaction.insert(operatorInvites).values({
      id: inviteId,
      personId,
      emailSha256: emailDigest,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    });
  });
  return Response.json({ personId, inviteId, siteId }, { status: 201 });
}
