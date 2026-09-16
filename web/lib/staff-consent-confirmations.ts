import { z } from "zod";
import { agreementTemplates } from "@/content/agreementTemplates.generated";

const heading = "\n## 同意の確認\n";
const body = agreementTemplates.staff_consent.body;
const headingIndex = body.indexOf(heading);
if (headingIndex < 0) throw new Error("スタッフ同意書に「同意の確認」がありません。");

export const staffConsentDocument = body.slice(0, headingIndex).trimEnd();
export const staffConsentConfirmations = body.slice(headingIndex + heading.length).trim()
  .split("\n").map((line) => {
    if (!line.startsWith("- ")) throw new Error("スタッフ同意書の確認項目を読み取れません。");
    return line.slice(2);
  });

export const staffConsentAcceptance = z.object({
  confirmations: z.array(z.literal(true)).length(staffConsentConfirmations.length),
});
