/**
 * 仕様書 §7.1 URL構造: rootlens.io/{walletAddress} or rootlens.io/@{username}
 *
 * クリエイターページ — ユーザーの公開済みコンテンツ一覧（インスタ風3列グリッド）
 */

import type { Metadata } from "next";
import { resolveUser, findPagesByUser } from "@/lib/server/page-store";
import CreatorPage from "@/components/CreatorPage";

interface Props {
  params: Promise<{ addressOrUsername: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { addressOrUsername } = await params;
  const identifier = decodeURIComponent(addressOrUsername);
  const user = await resolveUser(identifier);

  if (!user) {
    return { title: "Not Found" };
  }

  const displayName = user.displayName || shortenAddress(user.address);

  return {
    title: `${displayName} — RootLens`,
    description: user.bio || `${displayName}'s verified content on RootLens`,
    openGraph: {
      title: `${displayName} — RootLens`,
      description: user.bio || `${displayName}'s verified content on RootLens`,
      type: "profile",
      siteName: "RootLens",
    },
  };
}

export default async function CreatorPageRoute({ params }: Props) {
  const { addressOrUsername } = await params;
  const identifier = decodeURIComponent(addressOrUsername);
  const user = await resolveUser(identifier);

  if (!user) {
    return <NotFound />;
  }

  const pages = await findPagesByUser(user.address);

  return <CreatorPage user={user} pages={pages} />;
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
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>User not found</h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
        This user does not exist or has no published content.
      </p>
    </div>
  );
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}
