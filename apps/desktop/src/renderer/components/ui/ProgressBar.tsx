export function ProgressBar({
  value,
  label,
  className = "",
  size = "md",
}: {
  value: number;
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className={`bg-mint-100 w-full overflow-hidden rounded-full ${size === "sm" ? "h-1.5" : "h-2"} ${className}`}
    >
      <div
        className="h-full rounded-full bg-teal-600 transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
