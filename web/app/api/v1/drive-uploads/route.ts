import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { approvalEvents, approvalRequests, driveUploadAttempts, driveUploadFiles } from "@/db/schema";
import { authenticateDesktop } from "@/lib/desktop-auth";
import {
  driveFileProperties, driveFolderProperties, hasProperties, validateDesktopUnit,
} from "@/lib/drive-upload";
import { siteDrive } from "@/lib/site-drive";

const bodySchema = z.object({
  unitId: z.string().max(160),
  filesSha256: z.string().max(64),
  approvalEventId: z.string().min(5).max(100),
  files: z.array(z.object({
    path: z.string().max(240),
    bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    sha256: z.string().max(64),
  })).min(1).max(1000),
});

export async function POST(request: Request) {
  const authentication = await authenticateDesktop(request);
  if (!authentication.ok) return authentication.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || validateDesktopUnit(
    parsed.data.unitId, parsed.data.filesSha256, parsed.data.files,
  )) return Response.json({ error: "invalid unit files" }, { status: 400 });
  const input = parsed.data;
  const [approval] = await db.select({ id: approvalEvents.id }).from(approvalEvents)
    .innerJoin(approvalRequests, eq(approvalRequests.id, approvalEvents.requestId))
    .where(and(
      eq(approvalEvents.id, input.approvalEventId),
      eq(approvalEvents.personId, authentication.personId),
      eq(approvalRequests.siteId, authentication.siteId),
      eq(approvalRequests.unitId, input.unitId),
      eq(approvalRequests.filesSha256, input.filesSha256),
    )).limit(1);
  if (!approval) return Response.json({ error: "recording has no matching approval" }, { status: 403 });
  let [attempt] = await db.select().from(driveUploadAttempts).where(and(
    eq(driveUploadAttempts.siteId, authentication.siteId),
    eq(driveUploadAttempts.unitId, input.unitId),
  )).limit(1);
  if (attempt && attempt.filesSha256 !== input.filesSha256) {
    return Response.json({ error: "unit id already belongs to different bytes" }, { status: 409 });
  }
  if (attempt && attempt.approvalEventId !== approval.id) {
    return Response.json({ error: "upload already belongs to a different approval" }, { status: 409 });
  }
  const { site, drive } = await siteDrive(authentication.siteId);
  if (!attempt) {
    await drive.assertFolder(site.approvedDataFolderId, site.sharedDriveId);
    const attemptId = `upload_${randomUUID()}`;
    const folderId = await drive.generateId();
    const files = await Promise.all(input.files.map(async (file) => ({
      id: `upload_file_${randomUUID()}`,
      attemptId,
      path: file.path,
      bytes: file.bytes,
      sha256: file.sha256,
      driveFileId: await drive.generateId(),
    })));
    await db.transaction(async (transaction) => {
      await transaction.insert(driveUploadAttempts).values({
        id: attemptId,
        siteId: site.id,
        personId: authentication.personId,
        unitId: input.unitId,
        filesSha256: input.filesSha256,
        approvalEventId: approval.id,
        folderId,
      });
      await transaction.insert(driveUploadFiles).values(files);
    });
    [attempt] = await db.select().from(driveUploadAttempts).where(eq(driveUploadAttempts.id, attemptId)).limit(1);
  }
  const folderProperties = driveFolderProperties(site.id, input.unitId, input.filesSha256);
  const existingFolder = await drive.fileOrNull(attempt.folderId);
  if (!existingFolder) {
    await drive.createFolder({
      id: attempt.folderId,
      name: input.unitId,
      parentId: site.approvedDataFolderId,
      appProperties: folderProperties,
    });
  } else if (existingFolder.name !== input.unitId
      || existingFolder.mimeType !== "application/vnd.google-apps.folder"
      || existingFolder.parents?.[0] !== site.approvedDataFolderId
      || existingFolder.driveId !== site.sharedDriveId || existingFolder.trashed
      || !hasProperties(existingFolder.appProperties, folderProperties)) {
    throw new Error("Drive folder differs from upload record");
  }
  const files = await db.select().from(driveUploadFiles).where(eq(driveUploadFiles.attemptId, attempt.id));
  const sessions = await Promise.all(files.map(async (file) => {
    const existing = await drive.fileOrNull(file.driveFileId);
    const properties = driveFileProperties(site.id, attempt.unitId, file.path);
    if (existing) {
      if (existing.name !== file.path || existing.parents?.[0] !== attempt.folderId
          || existing.driveId !== site.sharedDriveId || existing.trashed
          || existing.size !== String(file.bytes) || existing.sha256Checksum !== file.sha256
          || !hasProperties(existing.appProperties, properties)) {
        throw new Error(`Drive file differs from upload record: ${file.path}`);
      }
      return { path: file.path, complete: true, uploadUrl: null };
    }
    return {
      path: file.path,
      complete: false,
      uploadUrl: await drive.startResumableUpload({
        id: file.driveFileId,
        name: file.path,
        bytes: file.bytes,
        mimeType: file.path === "rgb.mp4" ? "video/mp4" : "application/octet-stream",
        parentId: attempt.folderId,
        appProperties: properties,
      }),
    };
  }));
  return Response.json({
    attemptId: attempt.id,
    folderId: attempt.folderId,
    complete: attempt.status === "complete",
    files: sessions,
  }, { status: 201 });
}
