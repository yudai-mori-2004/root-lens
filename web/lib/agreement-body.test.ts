import { describe, expect, it } from "vitest";
import { agreementTemplates } from "@/content/agreementTemplates.generated";
import { agreementBodyForSite } from "./agreement-body";
import { sha256 } from "./encoding";

describe("electronic agreement body", () => {
  it("removes only paper signing fields from staff consent", () => {
    const body = agreementTemplates.staff_consent.electronicBody;
    expect(body).toContain("すでに提供された撮影データについては");
    expect(body).toContain("お問い合わせ：RootLens");
    expect(body).not.toContain("- [ ]");
    expect(body).not.toContain("署名（紙で同意する場合）");
    expect(body).not.toContain("| 記入欄 |");
    expect(agreementTemplates.staff_consent.sha256).toBe(sha256(body));
  });

  it("shows the site name and excludes the paper signature page", () => {
    const body = agreementBodyForSite(agreementTemplates.site_agreement.electronicBody, "テスト事業所");
    expect(body).toContain("［テスト事業所］");
    expect(body).toContain("第15条（準拠法）");
    expect(body).not.toContain("合意日：");
    expect(agreementTemplates.site_agreement.sha256).toBe(sha256(agreementTemplates.site_agreement.electronicBody));
  });
});
