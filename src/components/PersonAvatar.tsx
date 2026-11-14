import { cn } from "@/lib/utils";

// Initials avatar with a deterministic, AA-contrast tint. No photos (none are collected).
const TINTS = [
  "bg-[#F4E6EF] text-[#6A3359]",
  "bg-[#F6EEE4] text-[#6B4A22]",
  "bg-[#E8F5EE] text-[#1F5E3E]",
  "bg-[#EEF0FB] text-[#353B7A]",
  "bg-[#FBEFF2] text-[#7A2440]",
  "bg-[#EAF4F7] text-[#1D5566]",
];

export function PersonAvatar({ first, last, size = 36, className }: { first: string; last: string; size?: number; className?: string }) {
  const key = `${first}${last}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const initials = `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold", TINTS[h % TINTS.length], className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </span>
  );
}
