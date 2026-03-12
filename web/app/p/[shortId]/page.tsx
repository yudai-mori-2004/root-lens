/**
 * 仕様書 §7.1 URL構造: rootlens.io/p/{shortId}
 * 仕様書 §7.3 OGP
 *
 * Server Component: shortId を解決し、OGP メタデータを設定する。
 * クライアントサイド検証は ContentPage (Client Component) で実行。
 */

import type { Metadata } from "next";
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

  // §7.3 OGP: SNS共有時のプレビュー
  return {
    title: "RootLens で撮影されたコンテンツ",
    description: "撮影デバイスと撮影時刻が記録されたコンテンツです",
    openGraph: {
      title: "RootLens で撮影されたコンテンツ",
      description: "撮影デバイスと撮影時刻が記録されたコンテンツです",
      images: [{ url: page.ogpImageUrl, width: 1200, height: 630 }],
      type: "article",
      siteName: "RootLens",
    },
    twitter: {
      card: "summary_large_image",
      title: "RootLens で撮影されたコンテンツ",
      description: "撮影デバイスと撮影時刻が記録されたコンテンツです",
      images: [page.ogpImageUrl],
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

function NotFound() {
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
        コンテンツが見つかりません
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
        このリンクは無効か、コンテンツが削除された可能性があります
      </p>
    </div>
  );
}
