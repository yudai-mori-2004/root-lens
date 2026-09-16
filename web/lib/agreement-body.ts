export function agreementBodyForSite(body: string, siteName: string): string {
  return body.replace("［　　　　　　　　　　　　　　］", `［${siteName}］`);
}
