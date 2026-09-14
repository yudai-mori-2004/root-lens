import { describe, expect, it, vi } from "vitest";
import testVector from "../../tests/unit-files-v1.json";
import {
  driveFileProperties, driveFolderProperties, hasProperties, validateDesktopUnit,
  verifyStoredDriveUpload,
} from "./drive-upload";

describe("desktop Drive upload contract", () => {
  it("accepts a cross-runtime unit with arbitrary file formats", () => {
    expect(validateDesktopUnit(testVector.unitId, testVector.sha256, testVector.files)).toBeNull();
  });

  it("rejects any change to the approved file set", () => {
    const changed = testVector.files.map((file) => file.path === "session.mcap" ? { ...file, bytes: file.bytes + 1 } : file);
    expect(validateDesktopUnit(testVector.unitId, testVector.sha256, changed))
      .toBe("unit files SHA-256 mismatch");
    expect(validateDesktopUnit(testVector.unitId, testVector.sha256, testVector.files.slice(1)))
      .toBe("unit files SHA-256 mismatch");
  });

  it("requires the complete Drive provenance properties", () => {
    const expected = driveFileProperties("site_demo", testVector.unitId, "session.mcap");
    expect(hasProperties({ ...expected }, expected)).toBe(true);
    expect(hasProperties({ ...expected, extra: "value" }, expected)).toBe(false);
    expect(hasProperties({ ...expected, rootlens_site: "site_other" }, expected)).toBe(false);
  });

  it("rechecks the folder and every unit file at the final evidence boundary", async () => {
    const attempt = {
      folderId: "recording-folder",
      unitId: testVector.unitId,
      filesSha256: testVector.sha256,
    };
    const site = { id: "site_demo", sharedDriveId: "shared-drive", approvedDataFolderId: "approved-data" };
    const files = testVector.files.map((file) => ({
      path: file.path,
      bytes: file.bytes,
      sha256: file.sha256,
      driveFileId: `drive-${file.path}`,
    }));
    let missing = false;
    const drive = {
      file: vi.fn().mockResolvedValue({
        id: attempt.folderId,
        name: attempt.unitId,
        mimeType: "application/vnd.google-apps.folder",
        parents: [site.approvedDataFolderId],
        driveId: site.sharedDriveId,
        trashed: false,
        appProperties: driveFolderProperties(site.id, attempt.unitId, attempt.filesSha256),
      }),
      fileOrNull: vi.fn(async (id: string) => {
        if (missing) return null;
        const file = files.find((item) => item.driveFileId === id)!;
        return {
          id,
          name: file.path,
          mimeType: file.path === "rgb.mp4" ? "video/mp4" : "application/octet-stream",
          parents: [attempt.folderId],
          driveId: site.sharedDriveId,
          trashed: false,
          size: String(file.bytes),
          sha256Checksum: file.sha256,
          appProperties: driveFileProperties(site.id, attempt.unitId, file.path),
        };
      }),
    };
    await expect(verifyStoredDriveUpload(attempt, files, site, drive)).resolves.toBeUndefined();
    missing = true;
    await expect(verifyStoredDriveUpload(attempt, files, site, drive))
      .rejects.toThrow("Drive file verification failed");
  });
});
