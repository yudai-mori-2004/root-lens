import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import LegalDocumentPage from "../../components/info/LegalDocumentPage";
import { getLegalDoc } from "../../content/legalDocs.generated";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms governing the use of RootLens.",
};

export default async function TermsOfUse() {
  const lang = (await getLocale()) === "ja" ? "ja" : "en";
  const doc = getLegalDoc(lang, "terms-of-service");
  const lead = lang === "ja"
    ? "RootLensの利用条件について定めます。"
    : "These terms govern the use of RootLens.";
  const body = doc.html
    .replace(/^<h1>[\s\S]*?<\/h1>/, "")
    .replace(/^<p>[\s\S]*?<\/p>/, "");

  return <LegalDocumentPage title={doc.title} lead={lead} html={body} />;
}
