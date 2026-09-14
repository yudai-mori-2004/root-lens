import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalEvents, approvalRequests } from "@/db/schema";
import { authenticateDesktop } from "@/lib/desktop-auth";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const authentication = await authenticateDesktop(request);
  if (!authentication.ok) return authentication.response;
  const { id } = await context.params;
  const [row] = await db.select({
    id: approvalRequests.id,
    completed: approvalRequests.completed,
    expiresAt: approvalRequests.expiresAt,
    eventId: approvalEvents.id,
    receipt: approvalEvents.receipt,
  }).from(approvalRequests)
    .leftJoin(approvalEvents, eq(approvalEvents.requestId, approvalRequests.id))
    .where(and(
      eq(approvalRequests.id, id),
      eq(approvalRequests.siteId, authentication.siteId),
      eq(approvalRequests.personId, authentication.personId),
    )).limit(1);
  if (!row) return Response.json({ error: "approval not found" }, { status: 404 });
  if (row.completed && row.eventId) {
    return Response.json({ status: "complete", approvalEventId: row.eventId, receipt: row.receipt });
  }
  if (row.expiresAt <= new Date()) return Response.json({ status: "expired" });
  return Response.json({ status: "pending", expiresAt: row.expiresAt.toISOString() });
}
