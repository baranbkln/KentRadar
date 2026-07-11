import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type FloatingMapButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string;
};

export function FloatingMapButton({
  className,
  label,
  children,
  type = "button",
  ...props
}: FloatingMapButtonProps) {
  return (
    <button
      className={cn(
        "glass-panel inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-ink transition hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-road-blue disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      type={type}
      {...props}
    >
      {children}
      {label ? <span className="hidden sm:inline">{label}</span> : null}
    </button>
  );
}
