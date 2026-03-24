/**
 * 仕様書 §7.1 クリエイターページ
 *
 * ユーザーの公開済みコンテンツ一覧。インスタ風3列グリッド。
 * アプリのホーム画面 (PublishedGalleryScreen) と同様のレイアウト。
 */
"use client";

import { useState } from "react";
import type { CreatorProfile, CreatorPageItem } from "@/lib/server/page-store";

interface Props {
  user: CreatorProfile;
  pages: CreatorPageItem[];
}

export default function CreatorPage({ user, pages }: Props) {
  const [copied, setCopied] = useState(false);
  const displayName = user.displayName || shortenAddress(user.address);
  const basePath = user.username ? `/@${user.username}` : `/${user.address}`;

  const copyAddress = () => {
    navigator.clipboard.writeText(user.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 0 40px" }}>
      {/* ヘッダー */}
      <header style={{ padding: "32px 16px 24px", textAlign: "center" }}>
        {/* アバター */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: "var(--accent, #1E3A5F)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            fontWeight: 700,
            margin: "0 auto 12px",
          }}
        >
          {displayName.charAt(0).toUpperCase()}
        </div>

        {/* 表示名 */}
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
          {displayName}
        </h1>

        {/* ウォレットアドレス */}
        <button
          onClick={copyAddress}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            color: "var(--text-secondary, #666)",
            padding: "2px 8px",
            borderRadius: 4,
          }}
          title="Copy address"
        >
          {copied ? "Copied!" : shortenAddress(user.address)}
        </button>

        {/* Bio */}
        {user.bio && (
          <p style={{ fontSize: 14, color: "var(--text-secondary, #666)", margin: "8px 0 0" }}>
            {user.bio}
          </p>
        )}

        {/* 統計 */}
        <div style={{ fontSize: 14, color: "var(--text-secondary, #666)", marginTop: 12 }}>
          <strong>{pages.length}</strong> {pages.length === 1 ? "post" : "posts"}
        </div>
      </header>

      {/* 3列グリッド */}
      {pages.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary, #666)" }}>
          No published content yet.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 2,
          }}
        >
          {pages.map((page) => (
            <a
              key={page.pageId}
              href={`${basePath}/${page.pageId}`}
              style={{
                display: "block",
                position: "relative",
                aspectRatio: "1",
                overflow: "hidden",
                background: "var(--bg-secondary, #f0f0f0)",
              }}
            >
              {page.thumbnailUrl ? (
                <img
                  src={page.thumbnailUrl}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                  loading="lazy"
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-secondary, #999)",
                    fontSize: 12,
                  }}
                >
                  No image
                </div>
              )}

              {/* 複数コンテンツバッジ */}
              {page.contentCount > 1 && (
                <div
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    background: "rgba(0,0,0,0.6)",
                    color: "#fff",
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontWeight: 600,
                  }}
                >
                  {page.contentCount}
                </div>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function shortenAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}
