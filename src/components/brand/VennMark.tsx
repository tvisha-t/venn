"use client";
import { useId } from "react";

type Props = { size?: number; stroke?: string; overlap?: string; title?: string; className?: string };

/**
 * The Venn mark: two rounded strokes form a "v"; the gold overlap is what two people share.
 * Geometry is fixed (VENN_LOGO_AND_HOME.md). Strokes default to --mark-stroke, which is navy
 * in light mode and white in dark mode. Each instance gets its own clipPath id.
 */
export function VennMark({ size = 28, stroke = "var(--mark-stroke)", overlap = "var(--mark-overlap)", title, className }: Props) {
  const id = `vm-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const a11y = title ? { role: "img" as const, "aria-label": title } : { "aria-hidden": true as const };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} {...a11y}>
      <defs>
        <clipPath id={id}>
          <rect x="21" y="3.7" width="30" height="92.6" rx="15" transform="rotate(-26.57 36 50)" />
        </clipPath>
      </defs>
      <rect x="21" y="3.7" width="30" height="92.6" rx="15" transform="rotate(-26.57 36 50)" fill={stroke} />
      <rect x="49" y="3.7" width="30" height="92.6" rx="15" transform="rotate(26.57 64 50)" fill={stroke} />
      {/* Clip on the <g>, not the rotated rect, so the clip itself isn't rotated. */}
      <g clipPath={`url(#${id})`}>
        <rect x="49" y="3.7" width="30" height="92.6" rx="15" transform="rotate(26.57 64 50)" fill={overlap} />
      </g>
    </svg>
  );
}
