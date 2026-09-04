export type FrameworkId =
  | "bsi-it-grundschutz"
  | "nist-800-53-r5"
  | "nist-csf-2"
  | "iso-27001-2022"
  | "soc2-tsc"
  | "def-stan-05-138-i4"
  | "cyber-essentials-v3"
  | "nist-800-171-r2"
  | "nist-800-171-r3";

// Text-forward wordmarks only: official logos, insignia, and association marks
// must not be reproduced. The standards are named in our own typography for
// nominative use; BSI uses plain national colors without a protected emblem.
const WORDMARK_DETAILS: Record<
  Exclude<FrameworkId, "bsi-it-grundschutz">,
  { fill: string; line1: string; line2: string }
> = {
  "iso-27001-2022": { fill: "#4338CA", line1: "ISO", line2: "27001" },
  "soc2-tsc": { fill: "#7E22CE", line1: "SOC 2", line2: "TSC" },
  "nist-800-53-r5": {
    fill: "#1D4ED8",
    line1: "NIST",
    line2: "SP 800-53",
  },
  "nist-csf-2": { fill: "#0F766E", line1: "NIST", line2: "CSF 2.0" },
  "def-stan-05-138-i4": {
    fill: "#9F1239",
    line1: "DEF STAN",
    line2: "05-138",
  },
  "cyber-essentials-v3": {
    fill: "#0E7490",
    line1: "CYBER",
    line2: "ESSENTIALS",
  },
  "nist-800-171-r2": {
    fill: "#1E40AF",
    line1: "NIST",
    line2: "171 Rev. 2",
  },
  "nist-800-171-r3": {
    fill: "#1E3A8A",
    line1: "NIST",
    line2: "171 Rev. 3",
  },
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

  const details = WORDMARK_DETAILS[frameworkId];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="40" height="40" rx="6" fill={details.fill} />
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
        {details.line1}
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
        {details.line2}
      </text>
    </svg>
  );
}
