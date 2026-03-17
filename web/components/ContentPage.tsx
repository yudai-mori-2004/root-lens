"use client";

/**
 * 仕様書 §7.2 コンテンツページの表示内容
 * 仕様書 §7.4 クライアントサイド検証アーキテクチャ
 *
 * 2層表示:
 *   一般向け: 写真 + 「本物です」or「確認できません」+ スコア
 *   技術者向け: 全検証ステップ + オンチェーンデータ + リンク
 */

import { useEffect, useState } from "react";
import type {
  PageMeta,
  ContentRecord,
  VerificationResult,
  VerifyStepStatus,
} from "@/lib/types";
import { fetchContentRecord, verifyContent } from "@/lib/data";
import styles from "./ContentPage.module.css";

interface Props {
  page: PageMeta;
}

export default function ContentPage({ page }: Props) {
  const [record, setRecord] = useState<ContentRecord | null>(null);
  const [verification, setVerification] = useState<VerificationResult>({
    collectionVerified: "pending",
    teeSignatureVerified: "pending",
    c2paChainVerified: "pending",
    phashMatched: "pending",
    hardwareVerified: "skipped",
    extensions: [],
    overall: "pending",
  });
  const [techOpen, setTechOpen] = useState(false);

  useEffect(() => {
    fetchContentRecord(page.contentHash).then(({ record: r, resolved }) => {
      setRecord(r);
      verifyContent(page.contentHash, page.thumbnailUrl, resolved).then(
        setVerification
      );
    });
  }, [page.contentHash, page.thumbnailUrl]);

  const capturedDate = record ? formatDate(record.capturedAt) : null;

  // 検証スコア計算（skipped除外）
  const allSteps = [
    verification.collectionVerified,
    verification.teeSignatureVerified,
    verification.c2paChainVerified,
    verification.phashMatched,
    verification.hardwareVerified,
  ];
  const activeSteps = allSteps.filter(s => s !== "skipped" && s !== "pending");
  const passedSteps = activeSteps.filter(s => s === "verified").length;
  const totalSteps = activeSteps.length;

  return (
    <div className={styles.container}>
      {/* Hero Image */}
      <div className={styles.imageWrapper}>
        <img
          src={page.thumbnailUrl}
          alt="コンテンツ"
          className={styles.heroImage}
        />
      </div>

      {/* ===== 一般向け: シンプルな結果 ===== */}
      <div className={styles.infoSection}>
        {record ? (
          <>
            <h1 className={styles.headline}>
              Shot on {record.deviceName || "RootLens"}
            </h1>
            <div className={styles.meta}>
              <span className={styles.appBadge}>RootLens</span>
              <span className={styles.separator} />
              <time className={styles.timestamp} dateTime={record.capturedAt}>
                {capturedDate}
              </time>
            </div>
          </>
        ) : (
          <div className={styles.infoSkeleton}>
            <div className={styles.skeletonLine} style={{ width: "60%" }} />
            <div className={styles.skeletonLine} style={{ width: "40%", height: 14 }} />
          </div>
        )}
      </div>

      {/* 一般向け検証バッジ — 1行で完結 */}
      <div className={styles.verificationSection}>
        {verification.overall === "pending" ? (
          <div className={styles.trustBadge}>
            <LoadingDots />
            <span className={styles.trustText}>検証中...</span>
          </div>
        ) : verification.overall === "verified" ? (
          <div className={`${styles.trustBadge} ${styles.trustOk}`}>
            <StatusIcon status="verified" size={18} />
            <span className={styles.trustText}>
              本物のコンテンツです
            </span>
            <span className={styles.trustScore}>{passedSteps}/{totalSteps}</span>
          </div>
        ) : (
          <div className={`${styles.trustBadge} ${styles.trustWarn}`}>
            <StatusIcon status="failed" size={18} />
            <span className={styles.trustText}>
              確認できない項目があります
            </span>
            <span className={styles.trustScore}>{passedSteps}/{totalSteps}</span>
          </div>
        )}
      </div>

      {/* ===== 技術者向け: 全検証詳細 (折りたたみ) ===== */}
      <div className={styles.detailsSection}>
        <button
          className={styles.detailsToggle}
          onClick={() => setTechOpen(!techOpen)}
          aria-expanded={techOpen}
        >
          <span>Verification Details</span>
          <ChevronIcon open={techOpen} />
        </button>

        {techOpen && (
          <div className={styles.details}>
            {/* 検証ステップ */}
            <div className={styles.techSection}>
              <h3 className={styles.techTitle}>Core cNFT</h3>
              <TechRow
                status={verification.collectionVerified}
                label="Collection Membership"
                detail="core_collection_mint"
              />
              <TechRow
                status={verification.teeSignatureVerified}
                label="TEE Signature (Ed25519)"
                detail={record?.teeType}
              />
              <TechRow
                status={verification.c2paChainVerified}
                label="C2PA Provenance Chain"
                detail={record?.signingAlgorithm}
              />
            </div>

            <div className={styles.techSection}>
              <h3 className={styles.techTitle}>Extensions</h3>
              <TechRow
                status={verification.phashMatched}
                label="image-phash"
                detail={
                  verification.phashDistance !== undefined
                    ? `Hamming distance: ${verification.phashDistance}`
                    : undefined
                }
              />
              <TechRow
                status={verification.hardwareVerified}
                label="Hardware Signing"
                detail={
                  verification.hardwareVerified === "skipped"
                    ? "Not present (software-signed)"
                    : verification.extensions.find(e => e.extensionId.startsWith("hardware-"))?.extensionId
                }
              />
              {verification.extensions
                .filter(e => !e.extensionId.startsWith("hardware-") && e.extensionId !== "image-phash")
                .map((ext, i) => (
                  <TechRow
                    key={i}
                    status={ext.teeSignatureVerified}
                    label={ext.extensionId}
                    detail={ext.detail}
                  />
                ))
              }
            </div>

            {/* オンチェーンデータ */}
            <div className={styles.techSection}>
              <h3 className={styles.techTitle}>On-chain Data</h3>
              <DataRow label="Content Hash" value={page.contentHash} mono />
              {verification.assetId && (
                <DataRow label="cNFT Asset ID" value={verification.assetId} mono />
              )}
              {verification.arweaveUri && (
                <DataRow label="Arweave URI" value={verification.arweaveUri} mono link />
              )}
              {record && (
                <>
                  <DataRow label="TEE Type" value={record.teeType} />
                  <DataRow label="Signing Algorithm" value={record.signingAlgorithm} />
                  {record.sourceDimensions.width > 0 && (
                    <DataRow
                      label="Source Dimensions"
                      value={`${record.sourceDimensions.width} × ${record.sourceDimensions.height}`}
                    />
                  )}
                  {record.tsaProvider && (
                    <DataRow label="TSA" value={`${record.tsaProvider}${record.tsaTimestamp ? ` (${formatDateShort(record.tsaTimestamp)})` : ""}`} />
                  )}
                </>
              )}
            </div>

            <p className={styles.detailsNote}>
              All verification data is fetched directly from Solana RPC and Arweave.
              No RootLens server is involved in the verification process.
              You can confirm this in your browser&apos;s network inspector.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span className={styles.footerLogo}>RootLens</span>
          <span className={styles.footerTagline}>Prove it&apos;s real.</span>
        </div>
        <a
          href="https://rootlens.io"
          className={styles.footerLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          rootlens.io
        </a>
      </footer>
    </div>
  );
}

// --- 技術者向けコンポーネント ---

function TechRow({
  status,
  label,
  detail,
}: {
  status: VerifyStepStatus;
  label: string;
  detail?: string;
}) {
  return (
    <div className={styles.techRow}>
      <StatusIcon status={status} size={14} />
      <span className={styles.techLabel}>{label}</span>
      {detail && <span className={styles.techDetail}>{detail}</span>}
    </div>
  );
}

function DataRow({
  label,
  value,
  mono,
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: boolean;
}) {
  return (
    <div className={styles.detailRow}>
      <dt className={styles.detailLabel}>{label}</dt>
      <dd className={`${styles.detailValue} ${mono ? styles.mono : ""}`}>
        {link ? (
          <a href={value} target="_blank" rel="noopener noreferrer" className={styles.dataLink}>
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

// --- Icons ---

function StatusIcon({ status, size = 20 }: { status: VerifyStepStatus; size?: number }) {
  if (status === "pending") {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" className={styles.iconPending}>
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="16 34">
          <animateTransform attributeName="transform" type="rotate" from="0 10 10" to="360 10 10" dur="1s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
  }
  if (status === "verified") {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" className={styles.iconVerified}>
        <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.12" />
        <path d="M6 10.5l2.5 2.5 5.5-5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "skipped") {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" className={styles.iconSkipped}>
        <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.08" />
        <path d="M7 10h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={styles.iconFailed}>
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.12" />
      <path d="M7 7l6 6M13 7l-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LoadingDots() {
  return (
    <span className={styles.loadingDots}>
      <span /><span /><span />
    </span>
  );
}

// --- Helpers ---

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
