import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import HomePage from "../components/lp/HomePage";
import SiteLayout from "../components/shared/SiteLayout";
import { publicLocale, publicPages } from "../content/publicPages";

export async function generateMetadata(): Promise<Metadata> {
  const locale = publicLocale(await getLocale());
  const copy = publicPages[locale].home;
  return {
    // ルートページでは同じ階層の layout の title.template が適用されないため、
    // 検索結果のタイトルにブランド名を明示する。
    title: { absolute: copy.metaTitle },
    description: copy.metaDescription,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: locale === "ja" ? "ja_JP" : "en_US",
      siteName: "RootLens",
      url: "/",
      title: copy.metaTitle,
      description: copy.metaDescription,
    },
    twitter: {
      card: "summary",
      title: copy.metaTitle,
      description: copy.metaDescription,
    },
  };
}

export default async function Home() {
  return (
    <SiteLayout>
      <HomePage />
    </SiteLayout>
  );
}
