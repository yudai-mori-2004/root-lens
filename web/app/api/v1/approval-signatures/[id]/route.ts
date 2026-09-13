import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalEvents, approvalSignatures } from "@/db/schema";
import { authenticateDesktop } from "@/lib/desktop-auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authentication = await authenticateDesktop(request);
  if (!authentication.ok) return authentication.response;
  const { id } = await context.params;
  const [row] = await db.select({
    id: approvalSignatures.id,
    completed: approvalSignatures.completed,
    expiresAt: approvalSignatures.expiresAt,
    eventId: approvalEvents.id,
    receipt: approvalEvents.receipt,
  }).from(approvalSignatures)
    .leftJoin(approvalEvents, eq(approvalEvents.signatureId, approvalSignatures.id))
    .where(and(
      eq(approvalSignatures.id, id),
      eq(approvalSignatures.siteId, authentication.siteId),
      eq(approvalSignatures.personId, authentication.personId),
    )).limit(1);
  if (!row) return Response.json({ error: "approval not found" }, { status: 404 });
  if (row.completed && row.eventId) {
    return Response.json({ status: "complete", approvalEventId: row.eventId, receipt: row.receipt });
  }
  if (row.expiresAt <= new Date()) return Response.json({ status: "expired" });
  return Response.json({ status: "pending", expiresAt: row.expiresAt.toISOString() });
}
