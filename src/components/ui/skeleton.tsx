import { cn } from "~/lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular" | "rounded";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ 
  className, 
  variant = "rounded",
  width,
  height
}: SkeletonProps) {
  const variants = {
    text: "rounded",
    circular: "rounded-full",
    rectangular: "rounded-none",
    rounded: "rounded-lg"
  };
  
  return (
    <div
      className={cn(
        "skeleton",
        variants[variant],
        className
      )}
      style={{
        width: width,
        height: height || (variant === "text" ? "1rem" : undefined)
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="card-elevated p-6 space-y-4">
      <div className="flex justify-between items-center">
        <Skeleton width="40%" height="1.5rem" />
        <Skeleton width="4rem" height="1.5rem" />
      </div>
      <div className="space-y-2">
        <Skeleton width="100%" height="1rem" />
        <Skeleton width="80%" height="1rem" />
        <Skeleton width="60%" height="1rem" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card-elevated overflow-hidden">
      <div className="p-4 border-b border-slate-200">
        <Skeleton width="30%" height="1.5rem" />
      </div>
      <div className="divide-y divide-slate-200">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 flex items-center gap-4">
            <Skeleton variant="rectangular" width="1.25rem" height="1.25rem" className="rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton width="40%" height="1rem" />
              <Skeleton width="60%" height="0.875rem" />
            </div>
            <Skeleton width="5rem" height="0.75rem" />
          </div>
        ))}
      </div>
    </div>
  );
}