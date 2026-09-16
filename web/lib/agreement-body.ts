export function agreementBodyForSite(body: string, siteName: string): string {
  return body.replace("【甲の名称】", siteName);
}
