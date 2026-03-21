/**
 * Placeholder components for images/screenshots that will be replaced
 * with real assets provided by the user.
 *
 * Each placeholder clearly describes what real asset is needed.
 */

import s from "./lp.module.css";

interface PlaceholderProps {
  label: string;
  sublabel?: string;
  aspect?: string; // e.g. "16/9", "9/16", "1/1"
  maxWidth?: number;
}

export function ImagePlaceholder({
  label,
  sublabel,
  aspect = "16/9",
  maxWidth,
}: PlaceholderProps) {
  return (
    <div
      className={s.placeholder}
      style={{ aspectRatio: aspect, maxWidth: maxWidth ?? "100%" }}
    >
      <div className={s.placeholderLabel}>{label}</div>
      {sublabel && <div className={s.placeholderSublabel}>{sublabel}</div>}
    </div>
  );
}

export function PhoneMockup({
  label,
  sublabel,
}: {
  label: string;
  sublabel?: string;
}) {
  return (
    <div className={s.phoneMockup}>
      <div className={s.phoneNotch} />
      <div className={s.phoneScreen}>
        <div className={s.placeholderLabel}>{label}</div>
        {sublabel && <div className={s.placeholderSublabel}>{sublabel}</div>}
      </div>
    </div>
  );
}
