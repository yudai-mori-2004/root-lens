import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import LegalDocumentPage from "../../components/info/LegalDocumentPage";
import { getLegalDoc } from "../../content/legalDocs.generated";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How RootLens handles personal information.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPolicy() {
  const lang = (await getLocale()) === "ja" ? "ja" : "en";
  const doc = getLegalDoc(lang, "privacy-policy");
  const lead = lang === "ja"
    ? "RootLensにおける個人情報の取り扱いについて定めます。"
    : "This policy describes how RootLens handles personal information.";
  const body = doc.html
    .replace(/^<h1>[\s\S]*?<\/h1>/, "")
    .replace(/^<p>[\s\S]*?<\/p>/, "");

  return <LegalDocumentPage title={doc.title} lead={lead} html={body} />;
}
