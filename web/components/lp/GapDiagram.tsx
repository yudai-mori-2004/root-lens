/**
 * Gap Diagram: Two-track comparison
 * Left track: C2PA proof degrades (checkmark → X → X → X)
 * Right track: Title Protocol proof persists (checkmark → checkmark → checkmark → checkmark)
 *
 * Pure SVG, dark-mode aware via CSS variables, responsive.
 */
export default function GapDiagram() {
  const steps = [
    { label: "Original capture", left: true, right: true },
    { label: "Screenshot / re-save", left: false, right: true },
    { label: "Social media upload", left: false, right: true },
    { label: "Re-download", left: false, right: true },
  ];

  return (
    <div style={{ display: "flex", gap: 0, justifyContent: "center", flexWrap: "wrap" }}>
      {/* Left Track: C2PA only */}
      <Track
        title="C2PA alone"
        subtitle="Proof is in the file"
        steps={steps.map((s) => ({ label: s.label, pass: s.left }))}
        variant="degrading"
      />
      {/* Right Track: With Title Protocol */}
      <Track
        title="With Title Protocol"
        subtitle="Proof is on-chain"
        steps={steps.map((s) => ({ label: s.label, pass: s.right }))}
        variant="persistent"
      />
    </div>
  );
}

function Track({
  title,
  subtitle,
  steps,
  variant,
}: {
  title: string;
  subtitle: string;
  steps: { label: string; pass: boolean }[];
  variant: "degrading" | "persistent";
}) {
  const isRight = variant === "persistent";

  return (
    <div
      style={{
        flex: "1 1 280px",
        maxWidth: 340,
        padding: "28px 24px",
        border: `1.5px solid ${isRight ? "var(--lp-accent, #1E3A5F)" : "var(--lp-border, #d8d8d4)"}`,
        borderRadius: 8,
        margin: 8,
        background: isRight
          ? "color-mix(in srgb, var(--lp-accent, #1E3A5F) 4%, transparent)"
          : "var(--lp-bg, #fafaf8)",
      }}
    >
      <div
        style={{
          fontSize: "0.75rem",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase" as const,
          color: isRight ? "var(--lp-accent, #1E3A5F)" : "var(--lp-text-tertiary, #6e7279)",
          marginBottom: 2,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: "0.8rem",
          color: "var(--lp-text-secondary, #4a4e54)",
          marginBottom: 20,
        }}
      >
        {subtitle}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {steps.map((step, i) => {
          const showLine = i < steps.length - 1;
          // Color logic: degrading track starts pass then fails; persistent always passes
          const color = step.pass
            ? "var(--lp-accent, #1E3A5F)"
            : "#9a6458";
          const nextPass = i < steps.length - 1 ? steps[i + 1].pass : step.pass;
          const lineColor = nextPass
            ? "var(--lp-accent, #1E3A5F)"
            : "#c4a49c";

          return (
            <div key={i}>
              {/* Step row */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* Icon */}
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    background: step.pass
                      ? "var(--lp-accent, #1E3A5F)"
                      : "transparent",
                    border: step.pass
                      ? "none"
                      : "1.5px solid #c4a49c",
                    fontSize: "0.7rem",
                    color: step.pass ? "#fff" : "#9a6458",
                    fontWeight: 700,
                  }}
                >
                  {step.pass ? "\u2713" : "\u2717"}
                </div>
                {/* Label */}
                <div
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: i === 0 ? 600 : 400,
                    color: step.pass
                      ? "var(--lp-text, #1a1c1e)"
                      : "var(--lp-text-tertiary, #6e7279)",
                  }}
                >
                  {step.label}
                </div>
              </div>
              {/* Connector line */}
              {showLine && (
                <div
                  style={{
                    width: 1.5,
                    height: 16,
                    marginLeft: 10.5,
                    background: lineColor,
                    opacity: 0.4,
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
