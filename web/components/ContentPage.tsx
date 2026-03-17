"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  PageMeta,
  ContentRecord,
  VerificationResult,
  VerifyStepStatus,
  ExtensionVerification,
} from "@/lib/types";
import type { ResolvedContent } from "@/lib/content-resolver";
import type { CorePayload, ExtensionPayload, GraphNode } from "@title-protocol/sdk";
import { fetchContentRecord, verifyContent } from "@/lib/data";
import styles from "./ContentPage.module.css";

const PHASH_THRESHOLD = 5;

interface Props {
  page: PageMeta;
}

export default function ContentPage({ page }: Props) {
  const t = useTranslations("content");
  const tFooter = useTranslations("footer");
  const [record, setRecord] = useState<ContentRecord | null>(null);
  const [resolved, setResolved] = useState<ResolvedContent | null>(null);
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
    fetchContentRecord(page.contentHash).then(({ record: r, resolved: res }) => {
      setRecord(r);
      setResolved(res);
      verifyContent(page.contentHash, page.thumbnailUrl, res).then(setVerification);
    });
  }, [page.contentHash, page.thumbnailUrl]);

  const capturedDate = record ? formatDate(record.capturedAt) : null;

  // スコア — core + 全extensionのTEE署名を含む
  const coreSteps = [
    verification.collectionVerified,
    verification.teeSignatureVerified,
    verification.c2paChainVerified,
  ];
  const extSteps = [
    verification.phashMatched,
    verification.hardwareVerified,
    ...verification.extensions.map(e => e.teeSignatureVerified),
  ];
  const allSteps = [...coreSteps, ...extSteps];
  const active = allSteps.filter(s => s !== "skipped" && s !== "pending");
  const passed = active.filter(s => s === "verified").length;
  const total = active.length;

  // Core payload
  const corePayload = resolved?.coreSignedJson?.payload as CorePayload | undefined;
  const coreSj = resolved?.coreSignedJson;

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
            <ShieldIcon verified />
            <span className={styles.trustText}>{t("trust.verified")}</span>
            <span className={styles.trustScore}>{passed}/{total}</span>
          </div>
        ) : (
          <div className={`${styles.trustBadge} ${styles.trustWarn}`}>
            <ShieldIcon verified={false} />
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
          <div className={styles.techContent}>
            {/* --- 1. Title Protocol 導入 --- */}
            <section className={styles.techGroup}>
              <h3 className={styles.techGroupTitle}>{t("tech.intro.title")}</h3>
              <p className={styles.techDesc}>{t("tech.intro.desc")}</p>
              <p className={styles.techDesc}>{t("tech.intro.trustChain")}</p>
            </section>

            {/* --- 2. Core cNFT --- */}
            <section className={styles.techGroup}>
              <h3 className={styles.techGroupTitle}>{t("tech.core.title")}</h3>
              <p className={styles.techDesc}>{t("tech.core.desc")}</p>

              <h4 className={styles.techSubTitle}>{t("tech.core.verifyTitle")}</h4>
              <div className={styles.verifyList}>
                <VerifyItem
                  status={verification.collectionVerified}
                  label={t("tech.core.collection")}
                  detail={verification.collectionVerified === "verified" ? t("tech.core.collectionPass") : t("tech.core.collectionFail")}
                />
                <VerifyItem
                  status={verification.teeSignatureVerified}
                  label={t("tech.core.teeSig")}
                  detail={verification.teeSignatureVerified === "verified" ? t("tech.core.teeSigPass") : t("tech.core.teeSigFail")}
                />
                <VerifyItem
                  status={verification.c2paChainVerified}
                  label={t("tech.core.c2pa")}
                  detail={
                    verification.c2paChainVerified === "verified" && corePayload?.nodes
                      ? t("tech.core.c2paPass", { count: corePayload.nodes.length })
                      : t("tech.core.c2paFail")
                  }
                />
              </div>

              {/* Off-chain data structure */}
              {coreSj && (
                <>
                  <h4 className={styles.techSubTitle}>{t("tech.core.offchainTitle")}</h4>
                  <p className={styles.techDescSmall}>{t("tech.core.offchainDesc")}</p>
                  <div className={styles.dataBlock}>
                    <DataField label="protocol" value={coreSj.protocol} />
                    <DataField label="tee_type" value={coreSj.tee_type} />
                    <DataField label="tee_pubkey" value={truncate(coreSj.tee_pubkey, 12)} full={coreSj.tee_pubkey} />
                    {corePayload && (
                      <>
                        <DataField label="payload.content_hash" value={truncate(corePayload.content_hash, 12)} full={corePayload.content_hash} />
                        <DataField label="payload.content_type" value={corePayload.content_type} />
                        {corePayload.tsa_timestamp != null && (
                          <DataField label="payload.tsa_timestamp" value={formatTimestamp(corePayload.tsa_timestamp)} />
                        )}
                      </>
                    )}
                  </div>

                  {/* Provenance graph */}
                  {corePayload?.nodes && (
                    <>
                      <h4 className={styles.techSubTitle}>{t("tech.core.provenanceTitle")}</h4>
                      <div className={styles.dataBlock}>
                        <DataField label={t("tech.core.nodes")} value={t("tech.core.nodesCount", { count: corePayload.nodes.length }) + nodeBreakdown(corePayload.nodes)} />
                        <DataField
                          label={t("tech.core.links")}
                          value={corePayload.links && corePayload.links.length > 0
                            ? t("tech.core.linksCount", { count: corePayload.links.length })
                            : t("tech.core.noLinks")}
                        />
                      </div>
                    </>
                  )}

                  {/* Owner info */}
                  <h4 className={styles.techSubTitle}>{t("tech.core.ownerTitle")}</h4>
                  <div className={styles.dataBlock}>
                    <DataField
                      label={t("tech.core.creator")}
                      value={corePayload?.creator_wallet ? truncate(corePayload.creator_wallet, 8) : "—"}
                      full={corePayload?.creator_wallet}
                    />
                    <DataField
                      label={t("tech.core.currentOwner")}
                      value={
                        resolved?.ownerWallet
                          ? truncate(resolved.ownerWallet, 8) +
                            (corePayload?.creator_wallet === resolved.ownerWallet ? ` ${t("tech.core.sameOwner")}` : "")
                          : "—"
                      }
                      full={resolved?.ownerWallet}
                    />
                  </div>
                </>
              )}
            </section>

            {/* --- 3. Extensions --- */}
            <section className={styles.techGroup}>
              <h3 className={styles.techGroupTitle}>{t("tech.ext.title")}</h3>
              <p className={styles.techDesc}>{t("tech.ext.desc")}</p>

              {/* 各 extension を動的にレンダリング */}
              {verification.extensions.map((ext, i) => (
                <ExtensionBlock
                  key={ext.extensionId + i}
                  ext={ext}
                  verification={verification}
                  resolved={resolved}
                  t={t}
                />
              ))}

              {/* hardware extension が1つも検出されなかった場合 */}
              {!verification.extensions.some(e => e.extensionId.startsWith("hardware-")) && (
                <div className={styles.extBlock}>
                  <h5 className={styles.extTitle}>{t("tech.hardware.titleDefault")}</h5>
                  <p className={styles.techDescSmall}>{t("tech.hardware.desc")}</p>
                  <div className={styles.wipBadge}>{t("tech.hardware.wip")}</div>
                </div>
              )}
            </section>

            {/* --- 4. オンチェーン参照 --- */}
            <section className={styles.techGroup}>
              <h3 className={styles.techGroupTitle}>{t("tech.refs.title")}</h3>
              <div className={styles.refsBlock}>
                <RefRow label={t("tech.refs.contentHash")} sub={t("tech.refs.contentHashDesc")} value={page.contentHash} mono />
                {verification.assetId && (
                  <RefRow
                    label={t("tech.refs.assetId")}
                    value={verification.assetId}
                    mono
                    link={solanaExplorerUrl(verification.assetId)}
                    linkLabel={t("tech.refs.viewOnSolana")}
                  />
                )}
                {verification.arweaveUri && (
                  <RefRow
                    label={t("tech.refs.offchainUri")}
                    value={verification.arweaveUri}
                    mono
                    link={arweaveHttpUrl(verification.arweaveUri)}
                    linkLabel={t("tech.refs.viewOnStorage")}
                  />
                )}
                {record && (
                  <>
                    <RefRow label={t("tech.refs.teeType")} value={record.teeType} />
                    <RefRow label={t("tech.refs.sigAlgo")} value={record.signingAlgorithm} />
                    {record.sourceDimensions.width > 0 && (
                      <RefRow label={t("tech.refs.dimensions")} value={`${record.sourceDimensions.width} × ${record.sourceDimensions.height}`} />
                    )}
                    {record.tsaProvider && (
                      <RefRow label={t("tech.refs.tsa")} value={`${record.tsaProvider}${record.tsaTimestamp ? ` (${formatDateShort(record.tsaTimestamp)})` : ""}`} />
                    )}
                  </>
                )}
              </div>
            </section>

            {/* --- 5. なぜ信頼できるのか --- */}
            <section className={styles.techGroup}>
              <h3 className={styles.techGroupTitle}>{t("tech.why.title")}</h3>

              <div className={styles.whyItem}>
                <h4 className={styles.whyItemTitle}>{t("tech.why.trustless")}</h4>
                <p className={styles.techDesc}>{t("tech.why.trustlessDesc")}</p>
              </div>

              {record?.tsaProvider && (
                <div className={styles.whyItem}>
                  <h4 className={styles.whyItemTitle}>{t("tech.why.tsa")}</h4>
                  <p className={styles.techDesc}>{t("tech.why.tsaDesc")}</p>
                </div>
              )}

              <div className={styles.whyItem}>
                <h4 className={styles.whyItemTitle}>{t("tech.why.noServer")}</h4>
                <p className={styles.techDesc}>{t("tech.why.noServerDesc")}</p>
              </div>

              <div className={styles.whyItem}>
                <h4 className={styles.whyItemTitle}>{t("tech.why.oss")}</h4>
                <p className={styles.techDesc}>{t("tech.why.ossDesc")}</p>
                <div className={styles.ossLinks}>
                  <a href="https://github.com/yudai-mori-2004/title-protocol" target="_blank" rel="noopener noreferrer" className={styles.ossLink}>
                    Title Protocol <ExternalIcon />
                  </a>
                  <a href="https://github.com/yudai-mori-2004/root-lens" target="_blank" rel="noopener noreferrer" className={styles.ossLink}>
                    RootLens <ExternalIcon />
                  </a>
                </div>
              </div>
            </section>
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

// --- Extension Block (動的レンダリング) ---

function ExtensionBlock({
  ext,
  verification,
  resolved,
  t,
}: {
  ext: ExtensionVerification;
  verification: VerificationResult;
  resolved: ResolvedContent | null;
  t: ReturnType<typeof useTranslations>;
}) {
  const isPhash = ext.extensionId === "image-phash";
  const isHardware = ext.extensionId.startsWith("hardware-");

  // 対応する signed_json を検索
  const extSj = resolved?.extensionSignedJsons.find(sj => {
    const p = sj.payload as ExtensionPayload;
    return p.extension_id === ext.extensionId;
  });
  const extPayload = extSj?.payload as ExtensionPayload | undefined;

  if (isPhash) {
    return (
      <div className={styles.extBlock}>
        <h5 className={styles.extTitle}>{t("tech.phash.title")}</h5>
        <p className={styles.techDescSmall}>{t("tech.phash.desc")}</p>

        <div className={styles.verifyList}>
          <VerifyItem
            status={verification.phashMatched}
            label={t("tech.phash.match")}
            detail={
              verification.phashMatched === "verified" && verification.phashDistance !== undefined
                ? t("tech.phash.matchPass", { distance: verification.phashDistance, threshold: PHASH_THRESHOLD })
                : verification.phashMatched === "failed" && verification.phashDistance !== undefined
                  ? t("tech.phash.matchFail", { distance: verification.phashDistance, threshold: PHASH_THRESHOLD })
                  : t("tech.phash.matchSkip")
            }
          />
          <VerifyItem
            status={ext.teeSignatureVerified}
            label={t("tech.ext.teeSig")}
            detail={ext.teeSignatureVerified === "verified" ? t("tech.ext.teeSigPass") : t("tech.ext.teeSigFail")}
          />
        </div>

        {/* pHash data */}
        {extPayload && (
          <div className={styles.dataBlock}>
            {(extPayload as ExtensionPayload & { phash?: string }).phash && (
              <DataField label={t("tech.phash.onchain")} value={(extPayload as ExtensionPayload & { phash?: string }).phash!} mono />
            )}
            {extPayload.wasm_hash && (
              <DataField label="wasm_hash" value={truncate(extPayload.wasm_hash, 12)} full={extPayload.wasm_hash} mono />
            )}
          </div>
        )}
      </div>
    );
  }

  if (isHardware) {
    return (
      <div className={styles.extBlock}>
        <h5 className={styles.extTitle}>{t("tech.hardware.title", { id: ext.extensionId })}</h5>
        <p className={styles.techDescSmall}>{t("tech.hardware.desc")}</p>
        <div className={styles.wipBadge}>{t("tech.hardware.wip")}</div>
      </div>
    );
  }

  // Generic extension
  return (
    <div className={styles.extBlock}>
      <h5 className={styles.extTitle}>{ext.extensionId}</h5>
      <div className={styles.verifyList}>
        <VerifyItem
          status={ext.teeSignatureVerified}
          label={t("tech.ext.teeSig")}
          detail={ext.teeSignatureVerified === "verified" ? t("tech.ext.teeSigPass") : t("tech.ext.teeSigFail")}
        />
      </div>
      {extPayload && (
        <div className={styles.dataBlock}>
          <DataField label="extension_id" value={ext.extensionId} />
          {extPayload.wasm_hash && (
            <DataField label="wasm_hash" value={truncate(extPayload.wasm_hash, 12)} full={extPayload.wasm_hash} mono />
          )}
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function VerifyItem({ status, label, detail }: { status: VerifyStepStatus; label: string; detail: string }) {
  return (
    <div className={styles.verifyItem}>
      <div className={styles.verifyItemHeader}>
        <StatusIcon status={status} size={16} />
        <span className={styles.verifyItemLabel}>{label}</span>
      </div>
      <p className={styles.verifyItemDetail}>{detail}</p>
    </div>
  );
}

function DataField({ label, value, full, mono }: { label: string; value: string; full?: string; mono?: boolean }) {
  return (
    <div className={styles.dataRow}>
      <span className={styles.dataLabel}>{label}</span>
      <span className={`${styles.dataValue} ${mono ? styles.mono : ""}`} title={full || value}>{value}</span>
    </div>
  );
}

function RefRow({ label, sub, value, mono, link, linkLabel }: {
  label: string; sub?: string; value: string; mono?: boolean; link?: string; linkLabel?: string;
}) {
  return (
    <div className={styles.refRow}>
      <div className={styles.refLabel}>
        <span>{label}</span>
        {sub && <span className={styles.refSub}>{sub}</span>}
      </div>
      <div className={styles.refValue}>
        <span className={`${styles.refValueText} ${mono ? styles.mono : ""}`}>{value}</span>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className={styles.refLink}>
            {linkLabel} <ExternalIcon />
          </a>
        )}
      </div>
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

function ShieldIcon({ verified }: { verified: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className={verified ? styles.iconVerified : styles.iconFailed}>
      <path d="M10 1.5l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9v-5l7-3z" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.2" />
      {verified
        ? <path d="M7 10.5l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        : <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      }
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

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" style={{ display: "inline", verticalAlign: "middle", marginLeft: 2 }}>
      <path d="M4 1h7v7M11 1L5 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LoadingDots() {
  return <span className={styles.loadingDots}><span /><span /><span /></span>;
}

// --- Utilities ---

function nodeBreakdown(nodes: GraphNode[]): string {
  const finals = nodes.filter(n => n.type === "final").length;
  const ingredients = nodes.filter(n => n.type === "ingredient").length;
  if (nodes.length === 0) return "";
  return ` (final: ${finals}, ingredient: ${ingredients})`;
}

function truncate(s: string, len = 8): string {
  if (s.length <= len * 2 + 3) return s;
  return `${s.slice(0, len)}...${s.slice(-len)}`;
}

function arweaveHttpUrl(uri: string): string {
  if (uri.startsWith("ar://")) return `https://arweave.net/${uri.slice(5)}`;
  return uri;
}

function solanaExplorerUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatTimestamp(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")} (RFC 3161)`;
}
