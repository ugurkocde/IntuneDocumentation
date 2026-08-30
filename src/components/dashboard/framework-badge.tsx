export type FrameworkId =
  | "bsi-it-grundschutz"
  | "nist-800-53-r5"
  | "nist-csf-2";

// Text-forward wordmarks only: official government logos and insignia (the
// NIST logotype, the BSI Bundesadler) must not be reproduced. Naming the
// standard in our own typography is legitimate nominative use; for BSI the
// plain national colors provide recognition without any protected emblem.
const NIST_DETAILS: Partial<
  Record<FrameworkId, { fill: string; variant: string }>
> = {
  "nist-800-53-r5": { fill: "#1D4ED8", variant: "SP 800-53" },
  "nist-csf-2": { fill: "#0F766E", variant: "CSF 2.0" },
};

const FONT_FAMILY = "ui-sans-serif, system-ui, sans-serif";

export function FrameworkBadge({
  frameworkId,
  size = 40,
}: {
  frameworkId: FrameworkId;
  size?: number;
}) {
  if (frameworkId === "bsi-it-grundschutz") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        aria-hidden="true"
        focusable="false"
      >
        <rect
          width="39"
          height="39"
          x="0.5"
          y="0.5"
          rx="6"
          fill="#FFFFFF"
          stroke="#E2E8F0"
        />
        <rect x="7" y="8" width="5" height="8" fill="#000000" />
        <rect x="7" y="16" width="5" height="8" fill="#DD0000" />
        <rect x="7" y="24" width="5" height="8" fill="#FFCC00" />
        <text
          x="16"
          y="24.5"
          fill="#1E293B"
          fontFamily={FONT_FAMILY}
          fontSize="11.5"
          fontWeight="700"
          letterSpacing="0.4"
        >
          BSI
        </text>
      </svg>
    );
  }

  const details = NIST_DETAILS[frameworkId];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="40" height="40" rx="6" fill={details?.fill ?? "#334155"} />
      <text
        x="20"
        y="19"
        fill="white"
        fontFamily={FONT_FAMILY}
        fontSize="10.5"
        fontWeight="700"
        textAnchor="middle"
        letterSpacing="0.6"
      >
        NIST
      </text>
      <text
        x="20"
        y="30"
        fill="white"
        fillOpacity="0.85"
        fontFamily={FONT_FAMILY}
        fontSize="6.4"
        fontWeight="600"
        textAnchor="middle"
        letterSpacing="0.2"
      >
        {details?.variant ?? ""}
      </text>
    </svg>
  );
}
