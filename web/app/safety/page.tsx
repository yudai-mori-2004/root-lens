import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import LegalDocumentPage from "../../components/info/LegalDocumentPage";
import { getLegalDoc } from "../../content/legalDocs.generated";

export const metadata: Metadata = {
  title: "Child Safety Standards",
  description: "RootLens child safety standards.",
};

export default async function SafetyPage() {
  const lang = (await getLocale()) === "ja" ? "ja" : "en";
  const doc = getLegalDoc(lang, "child-safety");
  const body = doc.html.replace(/^<h1>[\s\S]*?<\/h1>/, "");

  return <LegalDocumentPage title={doc.title} html={body} />;
}
