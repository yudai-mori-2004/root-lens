import { z } from "zod";
import { agreementTemplates } from "@/content/agreementTemplates.generated";

const heading = "\n## 同意の確認\n";
const body = agreementTemplates.staff_consent.body;
const headingIndex = body.indexOf(heading);
if (headingIndex < 0) throw new Error("スタッフ同意書に「同意の確認」がありません。");

export const staffConsentDocument = body.slice(0, headingIndex).trimEnd();
export const staffConsentConfirmations = body.slice(headingIndex + heading.length).trim()
  .split("\n").map((line, index) => {
    const prefix = `${index + 1}. `;
    if (!line.startsWith(prefix)) throw new Error("スタッフ同意書の確認項目を読み取れません。");
    return line.slice(prefix.length);
  });

export const staffConsentAcceptance = z.object({
  confirmations: z.array(z.literal(true)).length(staffConsentConfirmations.length),
});
