import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driveUploadAttempts, driveUploadFiles } from "@/db/schema";
import { authenticateDesktop } from "@/lib/desktop-auth";
import { verifyStoredDriveUpload } from "@/lib/drive-upload";
import { siteDrive } from "@/lib/site-drive";

export async function POST(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  const authentication = await authenticateDesktop(request);
  if (!authentication.ok) return authentication.response;
  const { attemptId } = await context.params;
  const [attempt] = await db.select().from(driveUploadAttempts).where(and(
    eq(driveUploadAttempts.id, attemptId),
    eq(driveUploadAttempts.siteId, authentication.siteId),
  )).limit(1);
  if (!attempt) return Response.json({ error: "upload not found" }, { status: 404 });
  const files = await db.select().from(driveUploadFiles).where(eq(driveUploadFiles.attemptId, attempt.id));
  const { site, drive } = await siteDrive(authentication.siteId);
  try {
    await verifyStoredDriveUpload(attempt, files, site, drive);
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Drive upload verification failed",
    }, { status: 409 });
  }
  const completedAt = new Date();
  await db.transaction(async (transaction) => {
    await transaction.update(driveUploadFiles).set({ verifiedAt: completedAt })
      .where(eq(driveUploadFiles.attemptId, attempt.id));
    await transaction.update(driveUploadAttempts).set({ status: "complete", completedAt })
      .where(eq(driveUploadAttempts.id, attempt.id));
  });
  return Response.json({ unitId: attempt.unitId, folderId: attempt.folderId, complete: true });
}
