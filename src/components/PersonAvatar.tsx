import { cn } from "@/lib/utils";

// Navy initials avatar (no photos are collected). White initials on --brand in both themes.
export function PersonAvatar({ first, last, size = 44, className }: { first: string; last: string; size?: number; className?: string }) {
  const letter = (s: string) => (s.match(/\p{L}/u)?.[0] ?? "");
  const initials = `${letter(first)}${letter(last)}`.toUpperCase() || "·";
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full bg-brand font-bold text-on-brand", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials}
    </span>
  );
}
