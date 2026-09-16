import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalRequests, consentSnapshots, sites } from "@/db/schema";
import { APPROVAL_STATEMENT } from "@/lib/approval-record";
import { secureEqual } from "@/lib/desktop-auth-values";
import { sha256 } from "@/lib/encoding";
import { authenticateOperatorBrowser } from "@/lib/operator-browser";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const [approval] = await db.select({
    personId: approvalRequests.personId,
    siteName: sites.name,
    unitId: approvalRequests.unitId,
    files: approvalRequests.files,
    consentSnapshotId: approvalRequests.consentSnapshotId,
    tokenSha256: approvalRequests.tokenSha256,
    snapshotRecords: consentSnapshots.records,
  }).from(approvalRequests)
    .innerJoin(consentSnapshots, eq(consentSnapshots.id, approvalRequests.consentSnapshotId))
    .innerJoin(sites, eq(sites.id, approvalRequests.siteId))
    .where(and(eq(approvalRequests.id, id), gt(approvalRequests.expiresAt, new Date()), eq(approvalRequests.completed, false)))
    .limit(1);
  if (!approval || !secureEqual(sha256(token), approval.tokenSha256)) {
    return Response.json({ error: "approval link is invalid or expired" }, { status: 410 });
  }
  if (!await authenticateOperatorBrowser(request, approval.personId)) {
    return Response.json({ error: "browser login is required" }, { status: 401 });
  }
  const records = Array.isArray(approval.snapshotRecords) ? approval.snapshotRecords as Array<{ kind?: unknown }> : [];
  const siteAgreementCount = records.filter((record) => record.kind === "site_agreement").length;
  const staffConsentCount = records.filter((record) => record.kind === "staff_consent").length;
  if (siteAgreementCount !== 1 || staffConsentCount < 1) {
    return Response.json({ error: "consent snapshot is incomplete" }, { status: 409 });
  }
  return Response.json({
    statement: APPROVAL_STATEMENT,
    siteName: approval.siteName,
    unitId: approval.unitId,
    files: approval.files,
    consentSnapshot: {
      id: approval.consentSnapshotId,
      siteAgreementCount,
      staffConsentCount,
    },
  });
}
