import { Loader2 } from "lucide-react";

export function Spinner({ className = "h-4 w-4", label }: { className?: string; label?: string }) {
  return (
    <Loader2
      className={`animate-spin text-teal-700 motion-reduce:animate-none ${className}`}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      role={label ? "status" : undefined}
    />
  );
}
