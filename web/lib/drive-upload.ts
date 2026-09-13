import type { SourceFileIntegrity } from "./source-manifest";
import { SHA256_RE, sourceManifestSha256 } from "./source-manifest";
import type { GoogleDriveClient } from "./google-drive";

export const DESKTOP_UNIT_ID = /^unit_[a-z0-9][a-z0-9_-]{0,63}_\d{8}T\d{9}Z_[0-9A-HJKMNP-TV-Z]{8}$/;
export const DESKTOP_FILES = ["frames.jsonl", "imu.jsonl", "metadata.json", "rgb.mp4"] as const;

export function validateDesktopManifest(unitId: string, digest: string, files: SourceFileIntegrity[]): string | null {
  if (!DESKTOP_UNIT_ID.test(unitId) || !SHA256_RE.test(digest) || files.length !== DESKTOP_FILES.length) {
    return "invalid source manifest";
  }
  const names = [...files.map((file) => file.name)].sort();
  if (names.some((name, index) => name !== DESKTOP_FILES[index])) return "invalid source files";
  if (files.some((file) => !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !SHA256_RE.test(file.sha256))) {
    return "invalid source file integrity";
  }
  return sourceManifestSha256(unitId, files) === digest ? null : "source manifest SHA-256 mismatch";
}

export function driveFileProperties(siteId: string, unitId: string, path: string) {
  return {
    rootlens_site: siteId,
    rootlens_unit_id: unitId,
    rootlens_kind: "file",
    rootlens_file: path,
  };
}

export function driveFolderProperties(siteId: string, unitId: string, sourceManifest: string) {
  return {
    rootlens_site: siteId,
    rootlens_unit_id: unitId,
    rootlens_kind: "recording",
    rootlens_source_manifest: sourceManifest,
  };
}

export function hasProperties(actual: Record<string, string> | undefined, expected: Record<string, string>): boolean {
  return !!actual && Object.keys(expected).every((key) => actual[key] === expected[key])
    && Object.keys(actual).length === Object.keys(expected).length;
}

type StoredUpload = Readonly<{
  folderId: string;
  unitId: string;
  sourceManifestSha256: string;
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
  if (validateDesktopManifest(attempt.unitId, attempt.sourceManifestSha256,
    files.map((file) => ({ name: file.path, bytes: file.bytes, sha256: file.sha256 })))) {
    throw new Error("Stored source manifest is invalid");
  }
  const folder = await drive.file(attempt.folderId);
  if (folder.name !== attempt.unitId || folder.mimeType !== "application/vnd.google-apps.folder"
      || folder.parents?.[0] !== site.approvedDataFolderId
      || folder.driveId !== site.sharedDriveId || folder.trashed
      || !hasProperties(folder.appProperties,
        driveFolderProperties(site.id, attempt.unitId, attempt.sourceManifestSha256))) {
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
