import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { agreementRecords } from "@/db/schema";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [record] = await db.select({ fileId: agreementRecords.signedPdfFileId })
    .from(agreementRecords).where(eq(agreementRecords.id, id)).limit(1);
  if (!record?.fileId) return new Response("Not found", { status: 404 });
  return Response.redirect(`https://drive.google.com/open?id=${encodeURIComponent(record.fileId)}`, 302);
}
