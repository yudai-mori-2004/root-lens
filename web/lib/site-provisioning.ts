import { GoogleDriveClient } from "./google-drive";

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

export type SiteDriveIds = Pick<ProvisionedSite, "siteId" | "rootFolderId" | "siteAgreementsFolderId" | "staffConsentsFolderId" | "approvedDataFolderId">;

export async function provisionSiteDrive(siteName: string, ids: SiteDriveIds, drive: GoogleDriveClient): Promise<ProvisionedSite> {
  const sharedDrive = await drive.sharedDriveNamed(SHARED_DRIVE_NAME);
  const collection = await drive.folderNamed(COLLECTION_FOLDER_NAME, sharedDrive.id, sharedDrive.id);
  const distribution = await drive.folderNamed("アプリ配布", sharedDrive.id, sharedDrive.id);
  const installers = await drive.filesInFolder(distribution.id, sharedDrive.id);
  const platformInstallers = [
    /^RootLens-Import-\d+\.\d+\.\d+-macOS-(arm64|x86_64|universal2)\.dmg$/,
    /^RootLens-Import-Setup-\d+\.\d+\.\d+-windows-x64\.exe$/,
  ].map((pattern) => {
    const matches = installers.filter((file) => pattern.test(file.name));
    if (matches.length !== 1) throw new Error("Drive must have one current installer for each desktop platform");
    return matches[0];
  });
  await drive.createFolder({
    id: ids.rootFolderId,
    name: siteName,
    parentId: collection.id,
    appProperties: { rootlens_kind: "site", rootlens_site_id: ids.siteId },
  });
  const child = async (id: string, name: string, kind: string) => {
    await drive.createFolder({
      id,
      name,
      parentId: ids.rootFolderId,
      appProperties: { rootlens_kind: kind, rootlens_site_id: ids.siteId },
    });
  };
  for (const installer of platformInstallers) {
    await drive.copyFile(installer.id, installer.name, ids.rootFolderId, sharedDrive.id);
  }
  await child(ids.siteAgreementsFolderId, "現場合意書", "site_agreements");
  await child(ids.staffConsentsFolderId, "スタッフ同意書", "staff_consents");
  await child(ids.approvedDataFolderId, "承認済みデータ", "approved_data");
  return {
    siteId: ids.siteId,
    sharedDriveId: sharedDrive.id,
    rootFolderId: ids.rootFolderId,
    siteAgreementsFolderId: ids.siteAgreementsFolderId,
    staffConsentsFolderId: ids.staffConsentsFolderId,
    approvedDataFolderId: ids.approvedDataFolderId,
    drive,
  };
}
