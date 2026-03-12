"use client";

/**
 * 仕様書 §7.2 コンテンツページの表示内容
 * 仕様書 §7.4 クライアントサイド検証アーキテクチャ
 *
 * content_hash + サムネイル以外、RootLens サーバーからデータを取得しない。
 * 検証データは Title Protocol (Solana / Arweave) からクライアントサイドで取得する。
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
    phashMatched: "pending",
    c2paChainVerified: "pending",
    overall: "pending",
  });
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    // Title Protocol からコンテンツ記録を取得 → 取得結果で検証を実行
    fetchContentRecord(page.contentHash, page.assetId).then(({ record: r, resolved }) => {
      setRecord(r);
      // クライアントサイド検証を実行 (§7.4: サーバー関与なし)
      verifyContent(page.contentHash, page.thumbnailUrl, resolved).then(
        setVerification
      );
    });
  }, [page.contentHash, page.thumbnailUrl, page.assetId]);

  const capturedDate = record
    ? formatDate(record.capturedAt)
    : null;

  const headline = record
    ? `${record.deviceName} で撮影`
    : null;

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

      {/* Capture Info */}
      <div className={styles.infoSection}>
        {record ? (
          <>
            <h1 className={styles.headline}>{headline}</h1>
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
            <div
              className={styles.skeletonLine}
              style={{ width: "40%", height: 14 }}
            />
          </div>
        )}
      </div>

      {/* Verification Summary */}
      <div className={styles.verificationSection}>
        <VerificationSummary
          record={record}
          verification={verification}
        />
      </div>

      {/* Technical Details (collapsible) */}
      <div className={styles.detailsSection}>
        <button
          className={styles.detailsToggle}
          onClick={() => setDetailsOpen(!detailsOpen)}
          aria-expanded={detailsOpen}
        >
          <span>技術的な詳細</span>
          <ChevronIcon open={detailsOpen} />
        </button>

        {detailsOpen && (
          <TechnicalDetails
            record={record}
            verification={verification}
            contentHash={page.contentHash}
          />
        )}
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span className={styles.footerLogo}>RootLens</span>
          <span className={styles.footerTagline}>
            撮影の事実を、そのままに
          </span>
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

// --- Sub-components ---

function VerificationSummary({
  record,
  verification,
}: {
  record: ContentRecord | null;
  verification: VerificationResult;
}) {
  if (verification.overall === "pending") {
    return (
      <div className={styles.verifyCard}>
        <div className={styles.verifyLoading}>
          <LoadingDots />
          <span>記録を照合しています</span>
        </div>
      </div>
    );
  }

  const allVerified = verification.overall === "verified";

  return (
    <div
      className={`${styles.verifyCard} ${allVerified ? styles.verifyCardOk : styles.verifyCardWarn}`}
    >
      <div className={styles.verifyHeader}>
        <StatusIcon status={verification.overall} />
        <span className={styles.verifyTitle}>
          {allVerified
            ? "オンチェーン記録と一致"
            : "記録の照合に問題があります"}
        </span>
      </div>

      <div className={styles.verifyItems}>
        <VerifyItem
          status={verification.c2paChainVerified}
          label="C2PA署名"
          detail={record ? `${record.signingAlgorithm}` : undefined}
        />
        <VerifyItem
          status={verification.collectionVerified}
          label="Title Protocol"
          detail="正規コレクション"
        />
        <VerifyItem
          status={verification.teeSignatureVerified}
          label="TEE署名"
          detail={record?.teeType}
        />
        <VerifyItem
          status={verification.phashMatched}
          label="コンテンツ同一性"
          detail={
            verification.phashDistance !== undefined
              ? `pHash距離: ${verification.phashDistance}`
              : undefined
          }
        />
      </div>

      {allVerified && record?.tsaProvider && (
        <div className={styles.tsaNote}>
          タイムスタンプ: {record.tsaProvider} TSA により
          {record.tsaTimestamp ? ` ${formatDateShort(record.tsaTimestamp)} に` : ""}
          記録
        </div>
      )}
    </div>
  );
}

function VerifyItem({
  status,
  label,
  detail,
}: {
  status: VerifyStepStatus;
  label: string;
  detail?: string;
}) {
  return (
    <div className={styles.verifyItem}>
      <StatusIcon status={status} size={16} />
      <span className={styles.verifyItemLabel}>{label}</span>
      {detail && <span className={styles.verifyItemDetail}>{detail}</span>}
    </div>
  );
}

function TechnicalDetails({
  record,
  verification,
  contentHash,
}: {
  record: ContentRecord | null;
  verification: VerificationResult;
  contentHash: string;
}) {
  return (
    <div className={styles.details}>
      <DetailRow label="Content Hash" value={contentHash} mono />
      {verification.assetId && (
        <DetailRow label="cNFT Asset ID" value={verification.assetId} mono />
      )}
      {verification.arweaveUri && (
        <DetailRow label="Arweave URI" value={verification.arweaveUri} mono />
      )}
      {record && (
        <>
          <DetailRow label="署名アルゴリズム" value={record.signingAlgorithm} />
          <DetailRow label="TEE" value={record.teeType} />
          <DetailRow
            label="Assurance Level"
            value={`Level ${record.assuranceLevel}`}
          />
          <DetailRow
            label="元の解像度"
            value={`${record.sourceDimensions.width} x ${record.sourceDimensions.height}`}
          />
          {record.editOperations.length > 0 && (
            <DetailRow
              label="編集操作"
              value={record.editOperations.map((op) => op.type).join(", ")}
            />
          )}
          {record.tsaProvider && (
            <DetailRow
              label="タイムスタンプ"
              value={`${record.tsaProvider} TSA`}
            />
          )}
        </>
      )}

      <p className={styles.detailsNote}>
        検証データは Solana RPC および Arweave から直接取得しています。
        ブラウザの開発者ツールで通信先を確認できます。
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className={styles.detailRow}>
      <dt className={styles.detailLabel}>{label}</dt>
      <dd className={`${styles.detailValue} ${mono ? styles.mono : ""}`}>
        {value}
      </dd>
    </div>
  );
}

// --- Icons ---

function StatusIcon({
  status,
  size = 20,
}: {
  status: VerifyStepStatus;
  size?: number;
}) {
  if (status === "pending") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        className={styles.iconPending}
      >
        <circle
          cx="10"
          cy="10"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="16 34"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 10 10"
            to="360 10 10"
            dur="1s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>
    );
  }

  if (status === "verified") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 20 20"
        className={styles.iconVerified}
      >
        <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.12" />
        <path
          d="M6 10.5l2.5 2.5 5.5-5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  // failed / skipped
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className={styles.iconFailed}
    >
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.12" />
      <path
        d="M7 7l6 6M13 7l-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
    >
      <path
        d="M4 6l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LoadingDots() {
  return (
    <span className={styles.loadingDots}>
      <span />
      <span />
      <span />
    </span>
  );
}

// --- Helpers ---

function formatDate(iso: string): string {
  const d = new Date(iso);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}
