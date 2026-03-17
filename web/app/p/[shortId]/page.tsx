/**
 * 仕様書 §7.1 URL構造: rootlens.io/p/{shortId}
 * 仕様書 §7.3 OGP
 */

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { resolvePageMeta } from "@/lib/data";
import ContentPage from "@/components/ContentPage";

interface Props {
  params: Promise<{ shortId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shortId } = await params;
  const page = await resolvePageMeta(shortId);

  if (!page) {
    return { title: "Not Found" };
  }

  return {
    title: "Shot on RootLens",
    description: "Verified authentic content with tamper-proof provenance",
    openGraph: {
      title: "Shot on RootLens",
      description: "Verified authentic content with tamper-proof provenance",
      // OGPは仕様上1画像のため、全コンテンツのOGP画像を列挙
      images: page.contents.map((c) => ({ url: c.ogpImageUrl, width: 1200, height: 630 })),
      type: "article",
      siteName: "RootLens",
    },
    twitter: {
      card: "summary_large_image",
      title: "Shot on RootLens",
      description: "Verified authentic content with tamper-proof provenance",
      images: page.contents.map((c) => c.ogpImageUrl),
    },
  };
}

export default async function ContentPageRoute({ params }: Props) {
  const { shortId } = await params;
  const page = await resolvePageMeta(shortId);

  if (!page) {
    return <NotFound />;
  }

  return <ContentPage page={page} />;
}

async function NotFound() {
  const t = await getTranslations("notfound");

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>
        {t("title")}
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
        {t("description")}
      </p>
    </div>
  );
}
