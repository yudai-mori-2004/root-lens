import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { agreementTemplates } from "@/content/agreementTemplates.generated";
import AgreementDocument from "@/components/operator/AgreementDocument";
import { agreementBodyForSite } from "./agreement-body";
import { sha256 } from "./encoding";
import { staffConsentAcceptance, staffConsentConfirmations, staffConsentDocument } from "./staff-consent-confirmations";

describe("electronic agreement body", () => {
  it("keeps paper signing fields out of staff consent", () => {
    const body = agreementTemplates.staff_consent.body;
    expect(body).toContain("販売先へ提供済みの撮影データについては");
    expect(body).toContain("別途、撮影場所の管理者と対象となる方の同意を取得します");
    expect(body).toContain("撮影データを保管・複製・加工・分析します");
    expect(body).not.toContain("- [ ]");
    expect(body).not.toContain("署名（紙で同意する場合）");
    expect(body).not.toContain("| 記入欄 |");
    expect(agreementTemplates.staff_consent.sha256).toBe(sha256(body));
    const page = renderToStaticMarkup(createElement(AgreementDocument, { body }));
    expect(page).toContain("第1条（撮影するもの）");
    expect(page).toContain("<span>1</span>作業中の動画");
    expect(page).toContain("<span>(1)</span>映っている方の特定");
    expect(page).not.toContain("[ ]");
    expect(page).not.toContain("記入欄");
    expect(page).toContain("撮影参加に関する同意書");
  });

  it("requires every confirmation printed in the staff consent", () => {
    expect(staffConsentConfirmations).toHaveLength(5);
    expect(staffConsentConfirmations[0]).toBe("作業中の動画（映像と音声）とIMUセンサーによるデータが記録されることに同意します。");
    expect(staffConsentConfirmations[4]).toContain("すべてを回収・削除できない場合があることを確認しました。");
    expect(staffConsentDocument).not.toContain("第4条（同意の確認）");
    expect(staffConsentAcceptance.safeParse({ confirmations: [true, true, true, true, true] }).success).toBe(true);
    expect(staffConsentAcceptance.safeParse({ confirmations: [true, true, false, true, true] }).success).toBe(false);
    expect(staffConsentAcceptance.safeParse({ confirmations: [true] }).success).toBe(false);
  });

  it("shows the site name and excludes the paper signature page", () => {
    const body = agreementBodyForSite(agreementTemplates.site_agreement.body, "テスト事業所");
    expect(body).toContain("［テスト事業所］");
    expect(body).toContain("第15条（準拠法）");
    expect(body).not.toContain("合意日：");
    expect(agreementTemplates.site_agreement.sha256).toBe(sha256(agreementTemplates.site_agreement.body));
    const page = renderToStaticMarkup(createElement(AgreementDocument, { body }));
    expect(page).toContain("テスト事業所");
    expect(page).toContain("<span>4</span>乙は、第1条の目的の範囲内であっても");
    expect(page).toContain("<span>(1)</span>撮影された個人の特定");
    expect(page).not.toContain("<span>1.</span>");
    expect(page).not.toContain("合意日：");
  });
});
