"use client";

// /sample の 4 パネル + タイムライン + サマリー全部乗せ。
// - パイプライン切替 (arkit / mentra) はここで state 管理。 available=false のオプションは
//   表示は残すが、 プレビューへは切り替えられない。
// - trajectory / timeseries / summary を fetch でロードして子に流す。
// - RGB が master、 他は slave (詳細は TimeContext / RgbPanel 参照)。

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { TimeProvider } from "./TimeContext";
import RgbPanel from "./RgbPanel";
import DepthPanel from "./DepthPanel";
import ScenePanel from "./ScenePanel";
import NumericPanel from "./NumericPanel";
import TimelineBar from "./TimelineBar";
import SummaryBlock from "./SummaryBlock";
import ContentsSection from "./ContentsSection";
import type { PipelineOption, SessionOption, SummaryData, TimeSeriesData, TrajectoryData } from "./types";
import styles from "./sampleViewer.module.css";

interface Props {
  pipelines: PipelineOption[];
  /** サンプルデータの正 (共有ドライブ samples/) への URL。 最上部の CTA に出す。 */
  driveUrl: string;
  /** 初期表示するパイプライン ID (無指定なら available=true の最初のもの)。 */
  initialPipelineId?: string;
  /** 他ページの本文中に埋め込む場合は、ページタイトルと外部リンクを省く。 */
  embedded?: boolean;
}

export default function SampleViewer({ pipelines, driveUrl, initialPipelineId, embedded = false }: Props) {
  const t = useTranslations("pages.sample");
  const firstAvail = useMemo(() => pipelines.find((p) => p.available), [pipelines]);
  const [pipelineId, setPipelineId] = useState<string>(
    initialPipelineId ?? firstAvail?.id ?? pipelines[0].id,
  );
  const pipeline = useMemo(
    () => pipelines.find((p) => p.id === pipelineId) ?? pipelines[0],
    [pipelines, pipelineId],
  );
  // セッション選択はパイプラインをまたいで持ち越さない: 一覧に無い id なら先頭に落ちる。
  const sessions = pipeline.sessions ?? [];
  const [sessionId, setSessionId] = useState<string | null>(null);
  const session = sessions.find((s) => s.id === sessionId) ?? sessions[0] ?? null;

  return (
    <div className={embedded ? styles.embedded : styles.page}>
      <Header
        pipelines={pipelines}
        active={pipeline.id}
        onChange={setPipelineId}
        description={pipeline.description}
        pageTitle={t("pageTitle")}
        preparingBadge={t("preparingBadge")}
        driveUrl={driveUrl}
        driveCta={t("driveCta")}
        sessions={sessions}
        activeSession={session}
        onSessionChange={setSessionId}
        nowShowing={t("nowShowing")}
        embedded={embedded}
      />
      {pipeline.available && session ? (
        <LoadedViewer key={session.id} assets={session.assets} range={session.range} />
      ) : (
        <Placeholder label={pipeline.label} description={pipeline.description} placeholderTail={t("placeholder")} />
      )}
    </div>
  );
}

function Header({
  pipelines, active, onChange, description, pageTitle, preparingBadge,
  driveUrl, driveCta, sessions, activeSession, onSessionChange, nowShowing, embedded,
}: {
  pipelines: PipelineOption[];
  active: string;
  onChange: (id: string) => void;
  description: string;
  pageTitle: string;
  preparingBadge: string;
  driveUrl: string;
  driveCta: string;
  sessions: SessionOption[];
  activeSession: SessionOption | null;
  onSessionChange: (id: string) => void;
  nowShowing: string;
  embedded: boolean;
}) {
  return (
    <div className={styles.viewerHeader}>
      {/* 最上部: タイトルと、 サンプルデータの正 (ドライブ) への導線。 このページで再生して
          いるのはその中の 1 本にすぎない、 という主従を崩さない。 */}
      {!embedded && <div style={{
        display: "flex", flexWrap: "wrap", alignItems: "center",
        justifyContent: "space-between", gap: 12,
      }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: "var(--color-ink)" }}>
          {pageTitle}
        </h1>
        <a
          href={driveUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "10px 18px",
            borderRadius: 999,
            background: "#ffe600",
            color: "#131519",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          {driveCta} ↗
        </a>
      </div>}
      <div className={styles.pipelineTabs}>
        {pipelines.map((p) => {
          const isActive = p.id === active;
          return (
            <button
              key={p.id}
              type="button"
              disabled={!p.available}
              onClick={() => onChange(p.id)}
              className={isActive ? styles.pipelineTabActive : styles.pipelineTab}
            >
              {p.label}
              {!p.available && <span style={{ fontSize: 10, fontWeight: 500 }}>({preparingBadge})</span>}
            </button>
          );
        })}
      </div>
      <p className={styles.pipelineDescription}>
        {description}
      </p>
      {sessions.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {sessions.map((s) => {
            const isActive = s.id === activeSession?.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSessionChange(s.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: `1px solid ${isActive ? "var(--color-ink)" : "var(--color-rule-strong)"}`,
                  background: "transparent",
                  color: isActive ? "var(--color-ink)" : "var(--color-ink-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {s.domainLabel} {s.when}
              </button>
            );
          })}
        </div>
      )}
      {!embedded && activeSession && (
        <div style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
          {nowShowing}:{" "}
          <a
            href={activeSession.drive.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--color-ink)", fontFamily: "monospace",
              textDecoration: "underline", textUnderlineOffset: 3,
            }}
          >
            {activeSession.drive.path} ↗
          </a>
        </div>
      )}
    </div>
  );
}

function Placeholder({ label, description, placeholderTail }: {
  label: string;
  description: string;
  placeholderTail: string;
}) {
  return (
    <div style={{
      minHeight: 400, background: "#0b0d11",
      border: "1px dashed #2c3140", borderRadius: 8,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      color: "#7a8090", gap: 8, padding: 24, textAlign: "center",
    }}>
      <div style={{ fontSize: 14, color: "#e8ebf2" }}>{label}{placeholderTail}</div>
      <div style={{ fontSize: 12, maxWidth: 480 }}>{description}</div>
    </div>
  );
}

function LoadedViewer({ assets, range }: {
  assets: SessionOption["assets"];
  range?: SessionOption["range"];
}) {
  const t = useTranslations("pages.sample");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [trajectory, setTrajectory] = useState<TrajectoryData | null>(null);
  const [timeseries, setTimeseries] = useState<TimeSeriesData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(assets.summary).then((r) => r.json()),
      fetch(assets.trajectory).then((r) => r.json()),
      fetch(assets.timeseries).then((r) => r.json()),
    ])
      .then(([s, tr, ts]) => {
        if (cancelled) return;
        setSummary(s); setTrajectory(tr); setTimeseries(ts);
      })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [assets.summary, assets.trajectory, assets.timeseries]);

  if (error) {
    return (
      <div style={{ color: "#ff3d80", padding: 24 }}>
        {t("loadError")}
      </div>
    );
  }

  if (!summary || !trajectory || !timeseries) {
    return (
      <div style={{ minHeight: 400, color: "#7a8090", padding: 24 }}>
        {t("loading")}
      </div>
    );
  }

  return (
    <TimeProvider
      durationSec={summary.durationSec}
      range={range ? { start: range.startSec, end: range.endSec } : undefined}
    >
      <PanelGrid
        rgbUrl={assets.rgb}
        depthUrl={assets.depth}
        meshUrl={assets.mesh}
        trajectory={trajectory}
        timeseries={timeseries}
        recordingConfig={summary.recordingConfig}
      />
      <TimelineBar />
      <SummaryBlock summary={summary} />
      <ContentsSection summary={summary} />
    </TimeProvider>
  );
}

function PanelGrid({
  rgbUrl, depthUrl, meshUrl, trajectory, timeseries, recordingConfig,
}: {
  rgbUrl: string;
  depthUrl: string | null;
  meshUrl: string | null;
  trajectory: TrajectoryData;
  timeseries: TimeSeriesData;
  recordingConfig: string;
}) {
  const t = useTranslations("pages.sample.panels");
  const hasSpatialData = Boolean(depthUrl || meshUrl);
  return (
    // 2x2: 上段 RGB / Depth、 下段 3D シーン / センサー。
    <div className={styles.panelGrid}>
      <PanelCell title={t("rgb")}>
        <RgbPanel src={rgbUrl} />
      </PanelCell>
      {hasSpatialData ? (
        <>
          <PanelCell title={t("depth")}>
            <DepthPanel src={depthUrl} />
          </PanelCell>
          <PanelCell title={t("scene")} minHeight={320}>
            <ScenePanel meshUrl={meshUrl} trajectory={trajectory} />
          </PanelCell>
        </>
      ) : null}
      <PanelCell title={t(recordingConfig === "arkit" ? "numericWithHands" : "numeric")} minHeight={320}>
        <NumericPanel data={timeseries} />
      </PanelCell>
    </div>
  );
}

function PanelCell({ title, children, minHeight }: {
  title: string;
  children: React.ReactNode;
  minHeight?: number;
}) {
  return (
    <div style={{
      background: "#0b0d11",
      display: "flex", flexDirection: "column",
      minHeight,
      minWidth: 0,   // grid セルが中身の intrinsic width で膨らむのを防ぐ (= 兄弟セルの潰れ防止)
    }}>
      <div style={{
        fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: "#7a8090",
        padding: "8px 12px", borderBottom: "1px solid #1a1d24",
      }}>
        {title}
      </div>
      <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
