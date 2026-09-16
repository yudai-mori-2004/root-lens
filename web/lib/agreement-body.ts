export function agreementBodyForSite(electronicBody: string, siteName: string): string {
  return electronicBody.replace("［　　　　　　　　　　　　　　］", `［${siteName}］`);
}
