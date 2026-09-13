import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites } from "@/db/schema";

export async function GET(_request: Request, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params;
  const [site] = await db.select({ folderId: sites.approvedDataFolderId })
    .from(sites).where(eq(sites.id, siteId)).limit(1);
  if (!site) return new Response("Not found", { status: 404 });
  return Response.redirect(`https://drive.google.com/drive/folders/${encodeURIComponent(site.folderId)}`, 302);
}
