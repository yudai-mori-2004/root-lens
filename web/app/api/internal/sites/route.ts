import { z } from "zod";
import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { authenticateInternalRequest } from "@/lib/internal-auth";

const bodySchema = z.object({
  siteId: z.string().regex(/^site_[a-z0-9][a-z0-9_-]{1,63}$/),
  siteName: z.string().trim().min(1).max(200),
  sharedDriveId: z.string().min(10).max(200),
  rootFolderId: z.string().min(10).max(200),
  siteAgreementsFolderId: z.string().min(10).max(200),
  staffConsentsFolderId: z.string().min(10).max(200),
  approvedDataFolderId: z.string().min(10).max(200),
});

export async function POST(request: Request) {
  const unauthorized = authenticateInternalRequest(request);
  if (unauthorized) return unauthorized;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid site" }, { status: 400 });
  await db.insert(sites).values({
    id: parsed.data.siteId,
    name: parsed.data.siteName,
    sharedDriveId: parsed.data.sharedDriveId,
    rootFolderId: parsed.data.rootFolderId,
    siteAgreementsFolderId: parsed.data.siteAgreementsFolderId,
    staffConsentsFolderId: parsed.data.staffConsentsFolderId,
    approvedDataFolderId: parsed.data.approvedDataFolderId,
  });
  return Response.json({ siteId: parsed.data.siteId }, { status: 201 });
}
