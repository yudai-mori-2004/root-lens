"use client";

import { useTranslations } from "next-intl";
import s from "./lp.module.css";

export default function WhyPage() {
  const tIssues = useTranslations("lp.issues");
  const tC2pa = useTranslations("lp.c2pa");
  const issues = ["sns", "media", "insurance", "ai"] as const;

  return (
    <div className={s.page}>
      {/* Social issues */}
      <section className={s.section} style={{ paddingTop: 48 }}>
        <div className={s.sectionInner}>
          <h1 className={s.sectionTitle}>{tIssues("title")}</h1>
          <p className={s.sectionSubtitle}>{tIssues("intro")}</p>
          <div className={s.issuesGrid}>
            {issues.map((key) => (
              <div key={key} className={s.issueItem}>
                <div className={s.issueLabel}>{tIssues(`${key}.label`)}</div>
                <div className={s.issueText}>{tIssues(`${key}.text`)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Root cause argument */}
      <section className={s.section}>
        <div className={s.sectionInner}>
          <h2 className={s.sectionTitle}>{tC2pa("title")}</h2>
          <p className={s.prose}>{tC2pa("p1")}</p>
          <p className={s.prose}>{tC2pa("p2")}</p>
          <p className={s.prose}>{tC2pa("p3")}</p>
          <p className={s.prose}>
            <span className={s.emphasis}>{tC2pa("p4")}</span>
          </p>
          <p className={s.prose}>{tC2pa("p5")}</p>

          <div style={{ marginTop: 40 }}>
            <a href="/technology" className={s.ctaPrimary}>
              See how Title Protocol solves this
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
