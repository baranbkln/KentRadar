"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type AnimatedScoreProps = {
  value: number;
  className?: string;
  durationMs?: number;
};

const numberFormatter = new Intl.NumberFormat("tr-TR");

export function AnimatedScore({
  value,
  className,
  durationMs = 1_200,
}: AnimatedScoreProps) {
  const normalizedValue = Number.isFinite(value) ? Math.round(value) : 0;
  const [displayValue, setDisplayValue] = useState(0);
  const displayedValueRef = useRef(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion || durationMs <= 0) {
      displayedValueRef.current = normalizedValue;
      setDisplayValue(normalizedValue);
      return;
    }

    const startValue = displayedValueRef.current;
    const difference = normalizedValue - startValue;
    const startedAt = performance.now();
    let animationFrame = 0;

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(startValue + difference * easedProgress);

      displayedValueRef.current = nextValue;
      setDisplayValue(nextValue);

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    animationFrame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [durationMs, normalizedValue]);

  return (
    <span
      aria-label={numberFormatter.format(normalizedValue)}
      className={cn("tabular-nums", className)}
    >
      {numberFormatter.format(displayValue)}
    </span>
  );
}
