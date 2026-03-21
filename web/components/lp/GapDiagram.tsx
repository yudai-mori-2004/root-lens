/**
 * Visual diagram: C2PA proof dies when shared vs. Title Protocol proof survives
 * SVG-based, responsive, dark-mode aware via CSS variables
 */
export default function GapDiagram() {
  return (
    <svg
      viewBox="0 0 680 320"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Diagram showing how C2PA proof is lost when shared on social media, while Title Protocol preserves it independently"
      style={{ width: "100%", height: "auto", maxWidth: 680 }}
    >
      {/* Background */}
      <rect width="680" height="320" rx="8" fill="var(--lp-bg-alt, #f0f0ec)" />

      {/* --- Top path: Without Title Protocol --- */}
      <text x="20" y="36" fontSize="11" fontWeight="700" fill="var(--lp-text-tertiary, #6e7279)" letterSpacing="0.06em">
        WITHOUT TITLE PROTOCOL
      </text>

      {/* Photo + C2PA */}
      <rect x="20" y="52" width="120" height="56" rx="6" fill="var(--lp-accent, #1E3A5F)" opacity="0.12" />
      <rect x="20" y="52" width="120" height="56" rx="6" stroke="var(--lp-accent, #1E3A5F)" strokeWidth="1.5" fill="none" />
      <text x="80" y="75" fontSize="12" fontWeight="600" fill="var(--lp-text, #1a1c1e)" textAnchor="middle">
        Photo
      </text>
      <text x="80" y="93" fontSize="10" fill="var(--lp-accent, #1E3A5F)" textAnchor="middle" fontWeight="500">
        + C2PA proof
      </text>

      {/* Arrow 1 */}
      <line x1="148" y1="80" x2="192" y2="80" stroke="var(--lp-border, #d8d8d4)" strokeWidth="1.5" />
      <polygon points="192,75 204,80 192,85" fill="var(--lp-border, #d8d8d4)" />

      {/* SNS Upload */}
      <rect x="210" y="52" width="140" height="56" rx="6" fill="var(--lp-bg, #fafaf8)" stroke="var(--lp-border, #d8d8d4)" strokeWidth="1.5" />
      <text x="280" y="75" fontSize="12" fontWeight="600" fill="var(--lp-text, #1a1c1e)" textAnchor="middle">
        SNS upload
      </text>
      <text x="280" y="93" fontSize="10" fill="var(--lp-text-tertiary, #6e7279)" textAnchor="middle">
        metadata stripped
      </text>

      {/* Arrow 2 */}
      <line x1="358" y1="80" x2="402" y2="80" stroke="var(--lp-border, #d8d8d4)" strokeWidth="1.5" />
      <polygon points="402,75 414,80 402,85" fill="var(--lp-border, #d8d8d4)" />

      {/* Result: proof lost */}
      <rect x="420" y="52" width="240" height="56" rx="6" fill="none" stroke="var(--lp-text-tertiary, #6e7279)" strokeWidth="1.5" strokeDasharray="6 4" />
      <text x="540" y="75" fontSize="12" fontWeight="600" fill="var(--lp-text-tertiary, #6e7279)" textAnchor="middle">
        Photo without proof
      </text>
      <text x="540" y="93" fontSize="10" fill="var(--lp-text-tertiary, #6e7279)" textAnchor="middle">
        &quot;Is this real?&quot; Unverifiable.
      </text>

      {/* --- Divider --- */}
      <line x1="20" y1="140" x2="660" y2="140" stroke="var(--lp-border, #d8d8d4)" strokeWidth="1" />

      {/* --- Bottom path: With Title Protocol --- */}
      <text x="20" y="172" fontSize="11" fontWeight="700" fill="var(--lp-accent, #1E3A5F)" letterSpacing="0.06em">
        WITH TITLE PROTOCOL
      </text>

      {/* Photo + C2PA */}
      <rect x="20" y="188" width="120" height="56" rx="6" fill="var(--lp-accent, #1E3A5F)" opacity="0.12" />
      <rect x="20" y="188" width="120" height="56" rx="6" stroke="var(--lp-accent, #1E3A5F)" strokeWidth="1.5" fill="none" />
      <text x="80" y="211" fontSize="12" fontWeight="600" fill="var(--lp-text, #1a1c1e)" textAnchor="middle">
        Photo
      </text>
      <text x="80" y="229" fontSize="10" fill="var(--lp-accent, #1E3A5F)" textAnchor="middle" fontWeight="500">
        + C2PA proof
      </text>

      {/* Arrow to TP */}
      <line x1="148" y1="216" x2="192" y2="216" stroke="var(--lp-accent, #1E3A5F)" strokeWidth="1.5" />
      <polygon points="192,211 204,216 192,221" fill="var(--lp-accent, #1E3A5F)" />

      {/* Title Protocol box */}
      <rect x="210" y="188" width="140" height="56" rx="6" fill="var(--lp-accent, #1E3A5F)" opacity="0.08" stroke="var(--lp-accent, #1E3A5F)" strokeWidth="1.5" />
      <text x="280" y="211" fontSize="12" fontWeight="600" fill="var(--lp-accent, #1E3A5F)" textAnchor="middle">
        Title Protocol
      </text>
      <text x="280" y="229" fontSize="10" fill="var(--lp-text-secondary, #4a4e54)" textAnchor="middle">
        extracts &amp; records proof
      </text>

      {/* Two arrows out: file goes to SNS, proof goes to chain */}
      {/* Arrow: file → SNS (top branch) */}
      <line x1="350" y1="204" x2="414" y2="204" stroke="var(--lp-border, #d8d8d4)" strokeWidth="1.5" />
      <polygon points="414,199 426,204 414,209" fill="var(--lp-border, #d8d8d4)" />

      {/* Arrow: proof → chain (bottom branch) */}
      <line x1="350" y1="228" x2="414" y2="228" stroke="var(--lp-accent, #1E3A5F)" strokeWidth="1.5" />
      <polygon points="414,223 426,228 414,233" fill="var(--lp-accent, #1E3A5F)" />

      {/* SNS result (top) */}
      <rect x="432" y="188" width="108" height="28" rx="4" fill="var(--lp-bg, #fafaf8)" stroke="var(--lp-border, #d8d8d4)" strokeWidth="1" />
      <text x="486" y="207" fontSize="10" fill="var(--lp-text-tertiary, #6e7279)" textAnchor="middle">
        file (stripped)
      </text>

      {/* Chain result (bottom) */}
      <rect x="432" y="220" width="108" height="28" rx="4" fill="var(--lp-accent, #1E3A5F)" opacity="0.12" stroke="var(--lp-accent, #1E3A5F)" strokeWidth="1" />
      <text x="486" y="239" fontSize="10" fontWeight="600" fill="var(--lp-accent, #1E3A5F)" textAnchor="middle">
        proof (on-chain)
      </text>

      {/* Arrow: converge to verification */}
      <line x1="540" y1="204" x2="570" y2="216" stroke="var(--lp-border, #d8d8d4)" strokeWidth="1" />
      <line x1="540" y1="234" x2="570" y2="222" stroke="var(--lp-accent, #1E3A5F)" strokeWidth="1.5" />

      {/* Final: verified */}
      <rect x="576" y="200" width="84" height="36" rx="6" fill="var(--lp-accent, #1E3A5F)" />
      <text x="618" y="223" fontSize="11" fontWeight="600" fill="#fff" textAnchor="middle">
        Verified
      </text>

      {/* Bottom caption */}
      <text x="340" y="288" fontSize="10" fill="var(--lp-text-tertiary, #6e7279)" textAnchor="middle">
        Proof exists independently of the file. Metadata stripping doesn&apos;t matter.
      </text>
    </svg>
  );
}
