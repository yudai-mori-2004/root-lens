"use client";

import { useTranslations } from "next-intl";
import s from "./lp.module.css";

export default function AboutPage() {
  const tFooter = useTranslations("lp.footer");
  const tRl = useTranslations("lp.rootlens");

  return (
    <div className={s.page}>
      {/* RootLens story */}
      <section className={s.sectionHighlight}>
        <div className={s.sectionInner}>
          <h1 className={s.sectionTitle}>{tRl("title")}</h1>
          <p className={s.sectionSubtitle}>{tRl("subtitle")}</p>
          <p className={s.prose}>{tRl("p1")}</p>

          <div className={s.rootlensFlow}>
            {(["step1", "step2", "step3", "step4"] as const).map((key, i) => (
              <div key={key} className={s.flowStep}>
                <span className={s.flowNumber}>{i + 1}.</span>
                <span>{tRl(key)}</span>
              </div>
            ))}
          </div>

          <p className={s.prose} style={{ marginTop: 32 }}>
            {tRl("permanence")}
          </p>
          <p className={s.prose}>
            <span className={s.emphasis}>{tRl("targets")}</span>
          </p>
        </div>
      </section>

      {/* Team */}
      <section className={s.section}>
        <div className={s.sectionInner}>
          <h2 className={s.sectionTitle}>Team</h2>
          <p className={s.prose}>{tFooter("builtBy")}</p>
        </div>
      </section>
    </div>
  );
}
