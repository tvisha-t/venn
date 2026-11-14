import { cn } from "@/lib/utils";
import { dayNum, fullDate, monthShort } from "./format";

/** Month (gold, uppercase) over the day (mono). `dark` sits on the navy brand panel. */
export function DateTile({ iso, dark = false, className }: { iso: string; dark?: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={fullDate(iso)}
      className={cn(
        "flex h-[60px] w-14 shrink-0 flex-col items-center justify-center rounded-[14px]",
        dark ? "bg-brand-raised" : "bg-surface-raised",
        className,
      )}
    >
      <span aria-hidden className={cn("text-[11px] font-bold leading-4 tracking-[0.04em]", dark ? "text-accent" : "text-accent-text")}>{monthShort(iso)}</span>
      <span aria-hidden className={cn("font-mono text-[22px] leading-7", dark ? "text-on-brand" : "text-text")}>{dayNum(iso)}</span>
    </span>
  );
}
