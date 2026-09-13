"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Typewriter, { type TypewriterClass } from "typewriter-effect";
import s from "./home.module.css";

const imageStages = [
  [
    "/illustrations/work-bakery.jpg",
    "/illustrations/work-grocery.jpg",
    "/illustrations/work-restaurant.jpg",
  ],
  [
    "/illustrations/extraction-cut-1.jpg",
    "/illustrations/robot-research-use.jpg",
    "/illustrations/robot-development.jpg",
  ],
  [
    "/illustrations/payment-into-rootlens.jpg",
    "/illustrations/rootlens-distribution-hub.jpg",
    "/illustrations/revenue-cut-3.jpg",
  ],
] as const;

const columnClasses = [s.illustrationLeft, s.illustrationCenter, s.illustrationRight];

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
  const [reduceMotion, setReduceMotion] = useState(false);
  const typewriterRef = useRef<TypewriterClass | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReduceMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  const pause = () => typewriterRef.current?.stop();
  const resume = () => {
    if (!reduceMotion) typewriterRef.current?.start();
  };

  return (
    <figure
      className={s.workplaceFigure}
      tabIndex={0}
      aria-label={locale === "ja"
        ? "現場作業の撮影、データの取得、ロボット開発、収益還元の流れ"
        : "The flow from workplace capture and data collection to robot development and revenue return"}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
    >
      <div className={s.illustrationCluster} key={stage}>
        {imageStages[stage].map((src, index) => (
          <div className={`${s.illustrationCircle} ${columnClasses[index]}`} key={src}>
            <Image
              className={s.illustrationFrame}
              src={src}
              alt=""
              fill
              sizes="(max-width: 640px) 33vw, 21rem"
              preload={stage === 0}
            />
          </div>
        ))}
      </div>
      <figcaption className={s.processCaption} aria-hidden="true">
        {reduceMotion ? captions[0] : (
          <Typewriter
            component="span"
            options={{ cursor: "▌", delay: 48, deleteSpeed: 16, loop: true }}
            onInit={(typewriter) => {
              typewriterRef.current = typewriter;
              captions.forEach((caption, index) => {
                typewriter
                  .callFunction(() => setStage(index))
                  .typeString(caption)
                  .pauseFor(3000)
                  .deleteAll()
                  .pauseFor(250);
              });
              typewriter.start();
            }}
          />
        )}
      </figcaption>
    </figure>
  );
}
