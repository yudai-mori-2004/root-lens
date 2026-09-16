import { describe, expect, it, vi } from "vitest";
import { GoogleDriveClient } from "./google-drive";

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("agreement files in the RootLens shared Drive", () => {
  it("reuses a folder created before a registration retry", async () => {
    const request = vi.fn().mockResolvedValue(json({
      id: "site-folder", name: "Bakery", mimeType: "application/vnd.google-apps.folder",
      parents: ["collection"], trashed: false,
      appProperties: { rootlens_site_id: "site_test" },
    }));
    const drive = new GoogleDriveClient({ accessToken: "access" }, request);
    const folder = await drive.createFolder({ id: "site-folder", name: "Bakery", parentId: "collection",
      appProperties: { rootlens_site_id: "site_test" } });
    expect(folder.id).toBe("site-folder");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1].method).toBeUndefined();
  });

  it("does not copy a distributed installer twice on registration retry", async () => {
    const request = vi.fn().mockResolvedValue(json({ files: [{ id: "copy", name: "RootLens-Import-1.0.0-macOS-arm64.dmg",
      parents: ["site-folder"] }] }));
    const drive = new GoogleDriveClient({ accessToken: "access" }, request);
    await drive.copyFile("original", "RootLens-Import-1.0.0-macOS-arm64.dmg", "site-folder", "shared-drive");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reuses the preallocated file after a webhook retry instead of creating a duplicate", async () => {
    const bytes = new TextEncoder().encode("signed pdf");
    const request = vi.fn()
      .mockResolvedValueOnce(json({
        id: "agreements-folder", name: "agreements",
        mimeType: "application/vnd.google-apps.folder", driveId: "shared-drive", trashed: false,
      }))
      .mockResolvedValueOnce(json({
        id: "signed-file", name: "site-agreement.pdf", mimeType: "application/pdf",
        parents: ["agreements-folder"], driveId: "shared-drive", trashed: false,
        size: String(bytes.length), appProperties: { rootlens_agreement_record_id: "agr_test" },
      }))
      .mockResolvedValueOnce(new Response(bytes));
    const drive = new GoogleDriveClient({ accessToken: "access" }, request);
    const saved = await drive.uploadPdf({
      id: "signed-file",
      name: "site-agreement.pdf",
      bytes,
      parentId: "agreements-folder",
      sharedDriveId: "shared-drive",
      appProperties: { rootlens_agreement_record_id: "agr_test" },
    });
    expect(saved.fileId).toBe("signed-file");
    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.every((call) => !call[1]?.method || call[1].method === "GET")).toBe(true);
  });
});
