"use client";

import { useState } from "react";
import s from "./lp.module.css";

interface Slide {
  src: string;
  alt: string;
  label: string;
}

export default function PhoneCarousel({ slides }: { slides: Slide[] }) {
  const [active, setActive] = useState(0);

  return (
    <div className={s.phoneCarousel}>
      <div className={s.phoneFrame}>
        <div className={s.phoneNotch} />
        <div className={s.phoneScreen}>
          {slides.map((slide, i) => (
            <img
              key={i}
              src={slide.src}
              alt={slide.alt}
              className={`${s.phoneSlide} ${i === active ? s.phoneSlideActive : ""}`}
            />
          ))}
        </div>
      </div>
      <div className={s.phoneLabel}>{slides[active].label}</div>
      <div className={s.phoneDots}>
        {slides.map((_, i) => (
          <button
            key={i}
            className={`${s.phoneDot} ${i === active ? s.phoneDotActive : ""}`}
            onClick={() => setActive(i)}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
