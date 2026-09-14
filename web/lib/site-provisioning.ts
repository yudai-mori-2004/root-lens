import { randomUUID } from "node:crypto";
import { GoogleDriveClient } from "./google-drive";
import { googleDriveSession } from "./google-drive-session";

const SHARED_DRIVE_NAME = "RootLens Submit";
const COLLECTION_FOLDER_NAME = "現場データ収集";

export type ProvisionedSite = Readonly<{
  siteId: string;
  sharedDriveId: string;
  rootFolderId: string;
  siteAgreementsFolderId: string;
  staffConsentsFolderId: string;
  approvedDataFolderId: string;
  drive: GoogleDriveClient;
}>;

export async function provisionSiteDrive(siteName: string): Promise<ProvisionedSite> {
  const drive = new GoogleDriveClient(await googleDriveSession());
  const sharedDrive = await drive.sharedDriveNamed(SHARED_DRIVE_NAME);
  const collection = await drive.folderNamed(COLLECTION_FOLDER_NAME, sharedDrive.id, sharedDrive.id);
  const siteId = `site_${randomUUID()}`;
  const rootFolderId = await drive.generateId();
  await drive.createFolder({
    id: rootFolderId,
    name: siteName,
    parentId: collection.id,
    appProperties: { rootlens_kind: "site", rootlens_site_id: siteId },
  });
  const child = async (name: string, kind: string) => {
    const id = await drive.generateId();
    await drive.createFolder({
      id,
      name,
      parentId: rootFolderId,
      appProperties: { rootlens_kind: kind, rootlens_site_id: siteId },
    });
    return id;
  };
  return {
    siteId,
    sharedDriveId: sharedDrive.id,
    rootFolderId,
    siteAgreementsFolderId: await child("現場合意書", "site_agreements"),
    staffConsentsFolderId: await child("スタッフ同意書", "staff_consents"),
    approvedDataFolderId: await child("承認済みデータ", "approved_data"),
    drive,
  };
}
