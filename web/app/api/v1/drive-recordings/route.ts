import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { driveUploadAttempts, driveUploadFiles } from "@/db/schema";
import { authenticateDesktop } from "@/lib/desktop-auth";
import { driveFileProperties, hasProperties } from "@/lib/drive-upload";
import { siteDrive } from "@/lib/site-drive";

const bodySchema = z.object({ unitIds: z.array(z.string().min(1).max(160)).max(100) });

export async function POST(request: Request) {
  const authentication = await authenticateDesktop(request);
  if (!authentication.ok) return authentication.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid unit ids" }, { status: 400 });
  if (!parsed.data.unitIds.length) return Response.json({ recordings: [] });
  const attempts = await db.select().from(driveUploadAttempts).where(and(
    eq(driveUploadAttempts.siteId, authentication.siteId),
    eq(driveUploadAttempts.status, "complete"),
    inArray(driveUploadAttempts.unitId, parsed.data.unitIds),
  ));
  const { site, drive } = await siteDrive(authentication.siteId);
  const recordings = [];
  for (const attempt of attempts) {
    const files = await db.select().from(driveUploadFiles).where(eq(driveUploadFiles.attemptId, attempt.id));
    const folder = await drive.fileOrNull(attempt.folderId);
    if (!folder || folder.trashed || folder.driveId !== site.sharedDriveId
        || folder.name !== attempt.unitId || folder.parents?.[0] !== site.approvedDataFolderId
        || folder.appProperties?.rootlens_site !== site.id
        || folder.appProperties?.rootlens_unit_id !== attempt.unitId
        || folder.appProperties?.rootlens_kind !== "recording"
        || folder.appProperties?.rootlens_files_sha256 !== attempt.filesSha256) continue;
    const checked = await Promise.all(files.map((file) => drive.fileOrNull(file.driveFileId)));
    if (checked.every((saved, index) => saved && !saved.trashed
        && saved.name === files[index].path && saved.parents?.[0] === attempt.folderId
        && saved.driveId === site.sharedDriveId
        && saved.size === String(files[index].bytes) && saved.sha256Checksum === files[index].sha256
        && hasProperties(saved.appProperties, driveFileProperties(site.id, attempt.unitId, files[index].path)))) {
      recordings.push({
        unitId: attempt.unitId,
        folderId: attempt.folderId,
        filesSha256: attempt.filesSha256,
        files: Object.fromEntries(files.map((file) => [file.path, {
          id: file.driveFileId,
          size: file.bytes,
          sha256: file.sha256,
        }])),
      });
    }
  }
  return Response.json({ recordings });
}
