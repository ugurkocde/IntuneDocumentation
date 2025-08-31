import { type ReactNode } from "react";
import { cn } from "~/lib/utils";

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, hover = false, selected = false, onClick }: CardProps) {
  return (
    <div
      className={cn(
        "card-elevated",
        hover && "hover:shadow-lg hover:-translate-y-0.5",
        selected && "ring-2 ring-blue-500 ring-offset-2",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return (
    <div className={cn("px-6 py-4 border-b border-slate-200", className)}>
      {children}
    </div>
  );
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export function CardContent({ children, className }: CardContentProps) {
  return <div className={cn("p-6", className)}>{children}</div>;
}

interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div className={cn("px-6 py-4 border-t border-slate-200 bg-slate-50/50", className)}>
      {children}
    </div>
  );
}