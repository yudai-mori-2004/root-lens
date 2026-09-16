import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { agreementTemplates } from "@/content/agreementTemplates.generated";
import { createAgreementPdf } from "./agreement-original";
import { sha256 } from "./encoding";

describe("agreement original", () => {
  it("uses the same consent record for a site agreement", async () => {
    const pdf = await createAgreementPdf({
      agreementId: "agr_site_demo_20260917",
      kind: "site_agreement",
      siteId: "site_demo",
      siteName: "RootLens Bakery 豊中店",
      signer: { name: "山田 太郎", phoneLast4: "4821", identityId: "identity_demo" },
      acceptedAt: new Date("2026-09-17T01:15:00.000Z"),
      acceptedStatement: "上記内容を確認し、同意します",
    });
    expect(Buffer.from(pdf.subarray(0, 5)).toString("ascii")).toBe("%PDF-");
    if (process.env.WRITE_SITE_AGREEMENT_SAMPLE) {
      await writeFile(process.env.WRITE_SITE_AGREEMENT_SAMPLE, pdf);
    }
  });
  it("renders the fixed agreement text and SMS acceptance record as a PDF", async () => {
    const input = {
      agreementId: "agr_00000000-0000-4000-8000-000000000001",
      kind: "staff_consent" as const,
      siteId: "site_test",
      siteName: "テスト事業所",
      signer: { name: "山田 花子", phoneLast4: "1234", identityId: "identity_test" },
      acceptedAt: new Date("2026-09-14T05:32:10.000Z"),
      acceptedStatement: "上記内容を確認し、同意します",
    };
    const pdf = await createAgreementPdf(input);
    expect(Buffer.from(pdf.subarray(0, 5)).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
    expect(Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(3);
    expect(sha256(pdf)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256(await createAgreementPdf(input))).toBe(sha256(pdf));
    expect(agreementTemplates.staff_consent.sha256).toMatch(/^[0-9a-f]{64}$/);
    if (process.env.WRITE_AGREEMENT_SAMPLE) {
      await mkdir(dirname(process.env.WRITE_AGREEMENT_SAMPLE), { recursive: true });
      await writeFile(process.env.WRITE_AGREEMENT_SAMPLE, pdf);
    }
  });
});
