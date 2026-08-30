export type FrameworkId =
  | "bsi-it-grundschutz"
  | "nist-800-53-r5"
  | "nist-csf-2";

const BADGE_DETAILS: Record<
  FrameworkId,
  { fill: string; mark: string; fontSize: number; textLength?: number }
> = {
  "nist-800-53-r5": {
    fill: "#1D4ED8",
    mark: "800-53",
    fontSize: 9.5,
    textLength: 23,
  },
  "nist-csf-2": {
    fill: "#0F766E",
    mark: "CSF",
    fontSize: 11,
  },
  "bsi-it-grundschutz": {
    fill: "#B91C1C",
    mark: "BSI",
    fontSize: 11,
  },
};

export function FrameworkBadge({
  frameworkId,
  size = 40,
}: {
  frameworkId: FrameworkId;
  size?: number;
}) {
  const details = BADGE_DETAILS[frameworkId];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="40" height="40" rx="6" fill={details.fill} />
      <path
        d="M20 4.75 29 8.25v8c0 5.95-3.5 10.85-9 13.9-5.5-3.05-9-7.95-9-13.9v-8l9-3.5Z"
        fill="none"
        stroke="white"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="20"
        y="20"
        fill="white"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize={details.fontSize}
        fontWeight="700"
        textAnchor="middle"
        letterSpacing="0.15"
        textLength={details.textLength}
        lengthAdjust={details.textLength ? "spacingAndGlyphs" : undefined}
      >
        {details.mark}
      </text>
    </svg>
  );
}
