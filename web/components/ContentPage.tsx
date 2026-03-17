"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("content");
  const tFooter = useTranslations("footer");
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
      verifyContent(page.contentHash, page.thumbnailUrl, resolved).then(setVerification);
    });
  }, [page.contentHash, page.thumbnailUrl]);

  const capturedDate = record ? formatDate(record.capturedAt) : null;

  // スコア
  const allSteps = [
    verification.collectionVerified,
    verification.teeSignatureVerified,
    verification.c2paChainVerified,
    verification.phashMatched,
    verification.hardwareVerified,
  ];
  const active = allSteps.filter(s => s !== "skipped" && s !== "pending");
  const passed = active.filter(s => s === "verified").length;
  const total = active.length;

  return (
    <div className={styles.container}>
      {/* Hero */}
      <div className={styles.imageWrapper}>
        <img src={page.thumbnailUrl} alt="" className={styles.heroImage} />
      </div>

      {/* ===== 一般向け ===== */}
      <div className={styles.infoSection}>
        {record ? (
          <>
            <h1 className={styles.headline}>
              {record.deviceName
                ? t("shotOn", { device: record.deviceName })
                : t("shotOnDefault")}
            </h1>
            <div className={styles.meta}>
              <span className={styles.appBadge}>RootLens</span>
              <span className={styles.separator} />
              <time className={styles.timestamp} dateTime={record.capturedAt}>{capturedDate}</time>
            </div>
          </>
        ) : (
          <div className={styles.infoSkeleton}>
            <div className={styles.skeletonLine} style={{ width: "60%" }} />
            <div className={styles.skeletonLine} style={{ width: "40%", height: 14 }} />
          </div>
        )}
      </div>

      {/* Trust badge */}
      <div className={styles.verificationSection}>
        {verification.overall === "pending" ? (
          <div className={styles.trustBadge}>
            <LoadingDots />
            <span className={styles.trustText}>{t("trust.verifying")}</span>
          </div>
        ) : verification.overall === "verified" ? (
          <div className={`${styles.trustBadge} ${styles.trustOk}`}>
            <StatusIcon status="verified" size={18} />
            <span className={styles.trustText}>{t("trust.verified")}</span>
            <span className={styles.trustScore}>{passed}/{total}</span>
          </div>
        ) : (
          <div className={`${styles.trustBadge} ${styles.trustWarn}`}>
            <StatusIcon status="failed" size={18} />
            <span className={styles.trustText}>{t("trust.failed")}</span>
            <span className={styles.trustScore}>{passed}/{total}</span>
          </div>
        )}
      </div>

      {/* ===== 技術者向け詳細 ===== */}
      <div className={styles.detailsSection}>
        <button
          className={styles.detailsToggle}
          onClick={() => setTechOpen(!techOpen)}
          aria-expanded={techOpen}
        >
          <span>{t("tech.toggle")}</span>
          <ChevronIcon open={techOpen} />
        </button>

        {techOpen && (
          <div className={styles.details}>
            {/* Core */}
            <div className={styles.techSection}>
              <h3 className={styles.techTitle}>{t("tech.core")}</h3>
              <TechRow status={verification.collectionVerified} label={t("tech.collection")} detail="core_collection_mint" />
              <TechRow status={verification.teeSignatureVerified} label={t("tech.teeSig")} detail={record?.teeType} />
              <TechRow status={verification.c2paChainVerified} label={t("tech.c2pa")} detail={record?.signingAlgorithm} />
            </div>

            {/* Extensions */}
            <div className={styles.techSection}>
              <h3 className={styles.techTitle}>{t("tech.extensions")}</h3>
              <TechRow
                status={verification.phashMatched}
                label={t("tech.phash")}
                detail={verification.phashDistance !== undefined ? t("tech.hammingDist", { distance: verification.phashDistance }) : undefined}
              />
              <TechRow
                status={verification.hardwareVerified}
                label={t("tech.hardware")}
                detail={
                  verification.hardwareVerified === "skipped"
                    ? t("tech.hardwareNone")
                    : verification.extensions.find(e => e.extensionId.startsWith("hardware-"))?.extensionId
                }
              />
            </div>

            {/* On-chain */}
            <div className={styles.techSection}>
              <h3 className={styles.techTitle}>{t("tech.onchain")}</h3>
              <DataRow label="Content Hash" value={page.contentHash} mono />
              {verification.assetId && <DataRow label="cNFT Asset ID" value={verification.assetId} mono />}
              {verification.arweaveUri && <DataRow label="Arweave URI" value={verification.arweaveUri} mono link />}
              {record && (
                <>
                  <DataRow label="TEE Type" value={record.teeType} />
                  <DataRow label="Signing Algorithm" value={record.signingAlgorithm} />
                  {record.sourceDimensions.width > 0 && (
                    <DataRow label="Source Dimensions" value={`${record.sourceDimensions.width} × ${record.sourceDimensions.height}`} />
                  )}
                  {record.tsaProvider && (
                    <DataRow label="TSA" value={`${record.tsaProvider}${record.tsaTimestamp ? ` (${formatDateShort(record.tsaTimestamp)})` : ""}`} />
                  )}
                </>
              )}
            </div>

            {/* 仕組み説明 */}
            <div className={styles.howSection}>
              <h3 className={styles.techTitle}>{t("how.title")}</h3>
              <p className={styles.howText}>{t("how.p1")}</p>
              <p className={styles.howText}>{t("how.p2")}</p>
              <p className={styles.howText}>{t("how.p3")}</p>
              {record?.tsaProvider && <p className={styles.howText}>{t("how.tsa")}</p>}
              <p className={styles.howNote}>{t("how.p4")}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <span className={styles.footerLogo}>RootLens</span>
          <span className={styles.footerTagline}>{tFooter("tagline")}</span>
        </div>
        <a href="https://rootlens.io" className={styles.footerLink} target="_blank" rel="noopener noreferrer">
          rootlens.io
        </a>
      </footer>
    </div>
  );
}

// --- Sub-components ---

function TechRow({ status, label, detail }: { status: VerifyStepStatus; label: string; detail?: string }) {
  return (
    <div className={styles.techRow}>
      <StatusIcon status={status} size={14} />
      <span className={styles.techLabel}>{label}</span>
      {detail && <span className={styles.techDetail}>{detail}</span>}
    </div>
  );
}

function DataRow({ label, value, mono, link }: { label: string; value: string; mono?: boolean; link?: boolean }) {
  return (
    <div className={styles.detailRow}>
      <dt className={styles.detailLabel}>{label}</dt>
      <dd className={`${styles.detailValue} ${mono ? styles.mono : ""}`}>
        {link ? <a href={value} target="_blank" rel="noopener noreferrer" className={styles.dataLink}>{value}</a> : value}
      </dd>
    </div>
  );
}

function StatusIcon({ status, size = 20 }: { status: VerifyStepStatus; size?: number }) {
  if (status === "pending") return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={styles.iconPending}>
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="16 34">
        <animateTransform attributeName="transform" type="rotate" from="0 10 10" to="360 10 10" dur="1s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
  if (status === "verified") return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={styles.iconVerified}>
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.12" />
      <path d="M6 10.5l2.5 2.5 5.5-5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (status === "skipped") return (
    <svg width={size} height={size} viewBox="0 0 20 20" className={styles.iconSkipped}>
      <circle cx="10" cy="10" r="10" fill="currentColor" opacity="0.08" />
      <path d="M7 10h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
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
  return <span className={styles.loadingDots}><span /><span /><span /></span>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
