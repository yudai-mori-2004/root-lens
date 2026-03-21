"use client";

import { useTranslations } from "next-intl";
import s from "./lp.module.css";

const STEPS_KEYS = ["step1", "step2", "step3", "step4"] as const;
const PASS_MAP_C2PA = [true, false, false, false];
const PASS_MAP_TP = [true, true, true, true];

export default function GapDiagram() {
  const t = useTranslations("diagram");
  const labels = STEPS_KEYS.map((key) => t(key));

  return (
    <div style={{ display: "flex", gap: 0, justifyContent: "center", flexWrap: "wrap" }}>
      <Track
        title={t("c2paTitle")}
        subtitle={t("c2paSubtitle")}
        labels={labels}
        passMap={PASS_MAP_C2PA}
        highlight={false}
      />
      <Track
        title={t("tpTitle")}
        subtitle={t("tpSubtitle")}
        labels={labels}
        passMap={PASS_MAP_TP}
        highlight={true}
      />
    </div>
  );
}

function Track({
  title,
  subtitle,
  labels,
  passMap,
  highlight,
}: {
  title: string;
  subtitle: string;
  labels: string[];
  passMap: boolean[];
  highlight: boolean;
}) {
  return (
    <div className={`${s.gapTrack} ${highlight ? s.gapTrackHighlight : s.gapTrackDefault}`}>
      <div
        className={s.gapTrackTitle}
        style={{ color: highlight ? "var(--lp-accent)" : "var(--lp-text-tertiary)" }}
      >
        {title}
      </div>
      <div className={s.gapTrackSubtitle}>{subtitle}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {labels.map((label, i) => {
          const pass = passMap[i];
          const showLine = i < labels.length - 1;
          const nextPass = i < labels.length - 1 ? passMap[i + 1] : pass;

          return (
            <div key={i}>
              <div className={s.gapStepRow}>
                <div className={`${s.gapIcon} ${pass ? s.gapIconPass : s.gapIconFail}`}>
                  {pass ? "\u2713" : "\u2717"}
                </div>
                <div className={`${s.gapLabel} ${!pass ? s.gapLabelFail : ""}`}>
                  {label}
                </div>
              </div>
              {showLine && (
                <div
                  className={s.gapConnector}
                  style={{
                    background: nextPass
                      ? "var(--lp-accent)"
                      : "var(--lp-fail-muted)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
