import type { UnitFile } from "./unit-files";
import { validateUnitFiles } from "./unit-files";
import type { GoogleDriveClient } from "./google-drive";

export const DESKTOP_UNIT_ID = /^unit_[a-z0-9][a-z0-9_-]{0,63}_\d{8}T\d{9}Z_[0-9A-HJKMNP-TV-Z]{8}$/;
export function validateDesktopUnit(unitId: string, digest: string, files: UnitFile[]): string | null {
  if (!DESKTOP_UNIT_ID.test(unitId)) return "invalid unit id";
  return validateUnitFiles(unitId, digest, files);
}

export function driveFileProperties(siteId: string, unitId: string, path: string) {
  return {
    rootlens_site: siteId,
    rootlens_unit_id: unitId,
    rootlens_kind: "file",
    rootlens_file: path,
  };
}

export function driveFolderProperties(siteId: string, unitId: string, filesSha256: string) {
  return {
    rootlens_site: siteId,
    rootlens_unit_id: unitId,
    rootlens_kind: "recording",
    rootlens_files_sha256: filesSha256,
  };
}

export function hasProperties(actual: Record<string, string> | undefined, expected: Record<string, string>): boolean {
  return !!actual && Object.keys(expected).every((key) => actual[key] === expected[key])
    && Object.keys(actual).length === Object.keys(expected).length;
}

type StoredUpload = Readonly<{
  folderId: string;
  unitId: string;
  filesSha256: string;
}>;

type StoredUploadFile = Readonly<{
  path: string;
  bytes: number;
  sha256: string;
  driveFileId: string;
}>;

type UploadSite = Readonly<{
  id: string;
  sharedDriveId: string;
  approvedDataFolderId: string;
}>;

export async function verifyStoredDriveUpload(
  attempt: StoredUpload,
  files: StoredUploadFile[],
  site: UploadSite,
  drive: Pick<GoogleDriveClient, "file" | "fileOrNull">,
): Promise<void> {
  if (validateDesktopUnit(attempt.unitId, attempt.filesSha256,
    files.map((file) => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 })))) {
    throw new Error("Stored unit files are invalid");
  }
  const folder = await drive.file(attempt.folderId);
  if (folder.name !== attempt.unitId || folder.mimeType !== "application/vnd.google-apps.folder"
      || folder.parents?.[0] !== site.approvedDataFolderId
      || folder.driveId !== site.sharedDriveId || folder.trashed
      || !hasProperties(folder.appProperties,
        driveFolderProperties(site.id, attempt.unitId, attempt.filesSha256))) {
    throw new Error("Drive folder verification failed");
  }
  for (const file of files) {
    const saved = await drive.fileOrNull(file.driveFileId);
    if (!saved || saved.name !== file.path || saved.parents?.[0] !== attempt.folderId
        || saved.driveId !== site.sharedDriveId || saved.trashed
        || saved.size !== String(file.bytes) || saved.sha256Checksum !== file.sha256
        || !hasProperties(saved.appProperties, driveFileProperties(site.id, attempt.unitId, file.path))) {
      throw new Error(`Drive file verification failed: ${file.path}`);
    }
  }
}
