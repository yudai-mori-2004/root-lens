import { describe, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { agreementTemplates } from "@/content/agreementTemplates.generated";
import { createAgreementPdf } from "./agreement-original";
import { sha256 } from "./encoding";

describe("agreement original", () => {
  it("renders the fixed agreement text and SMS acceptance record as a PDF", async () => {
    const pdf = await createAgreementPdf({
      agreementId: "agr_00000000-0000-4000-8000-000000000001",
      kind: "staff_consent",
      siteId: "site_test",
      siteName: "テスト事業所",
      signer: { name: "山田 花子", phoneLast4: "1234", identityId: "identity_test" },
      acceptedAt: new Date("2026-09-14T05:32:10.000Z"),
      acceptedStatement: "上記内容を確認し、同意します",
    });
    expect(Buffer.from(pdf.subarray(0, 5)).toString("ascii")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(10_000);
    expect(sha256(pdf)).toMatch(/^[0-9a-f]{64}$/);
    expect(agreementTemplates.staff_consent.sha256).toMatch(/^[0-9a-f]{64}$/);
    if (process.env.WRITE_AGREEMENT_SAMPLE) {
      await mkdir(dirname(process.env.WRITE_AGREEMENT_SAMPLE), { recursive: true });
      await writeFile(process.env.WRITE_AGREEMENT_SAMPLE, pdf);
    }
  });
});
