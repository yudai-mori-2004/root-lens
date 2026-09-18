"use client";

import Image from "next/image";
import { useState } from "react";
import s from "./home.module.css";

const imageStages = [
  "/illustrations/lifecycle-work.webp",
  "/illustrations/lifecycle-development.webp",
  "/illustrations/lifecycle-return.webp",
] as const;

export default function LifecycleAnimation({ locale }: { locale: "ja" | "en" }) {
  const captions = locale === "ja"
    ? [
        "現場の手作業を、一人称視点で撮影。",
        "データを、ロボット開発に活用。",
        "得られた利益を、現場へ還元。",
      ]
    : [
        "Capture work in first person.",
        "Use the data to develop robots.",
        "Return revenue to workplaces.",
      ];
  const [stage, setStage] = useState(0);

  return (
    <figure className={s.workplaceFigure}>
      <div className={s.illustrationCluster}>
        {imageStages.map((src, index) => (
          <Image
            className={`${s.illustrationStrip} ${index === stage ? s.illustrationStripActive : ""}`}
            src={src}
            alt=""
            fill
            sizes="(max-width: 832px) 100vw, 52rem"
            loading={index === 0 ? "eager" : "lazy"}
            aria-hidden={index !== stage}
            key={src}
          />
        ))}
      </div>
      <figcaption className={s.processFooter}>
        <span className={s.processCaption} aria-live="polite">
          <span className={s.processNumber}>0{stage + 1} / 03</span>
          {captions[stage]}
        </span>
        <div className={s.processControls}>
          <button
            type="button"
            aria-label={locale === "ja" ? "前の画像" : "Previous image"}
            onClick={() => setStage((current) => (current + imageStages.length - 1) % imageStages.length)}
          >
            ←
          </button>
          <button
            type="button"
            aria-label={locale === "ja" ? "次の画像" : "Next image"}
            onClick={() => setStage((current) => (current + 1) % imageStages.length)}
          >
            →
          </button>
        </div>
      </figcaption>
    </figure>
  );
}
