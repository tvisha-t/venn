import { cn } from "@/lib/utils";
import type { EventItem } from "@/server/events";

/**
 * Overlapping initials (only members who claimed + approved their profile), the mono count,
 * and ONE highlighted "you share" phrase when real overlap exists.
 */
export function GoingStack({
  event, max = 3, size = 26, dark = false, featured = false, compact = false,
}: { event: Pick<EventItem, "avatars" | "going" | "phrase" | "sharedCount">; max?: number; size?: number; dark?: boolean; featured?: boolean; compact?: boolean }) {
  const shown = event.avatars.slice(0, max);
  const phrase = featured ? (event.sharedCount > 0 ? `${event.sharedCount} you share something with` : null) : event.phrase;
  const shortPhrase = featured && event.sharedCount > 0 ? `${event.sharedCount} in common` : null; // phones
  return (
    <div className="flex min-w-0 items-center gap-2">
      {shown.length > 0 && (
        <span className="flex shrink-0" aria-hidden>
          {shown.map((a, i) => (
            <span
              key={a.id}
              className={cn(
                "inline-grid place-items-center rounded-full font-bold ring-2",
                dark ? "bg-surface text-primary-ink ring-brand" : "bg-brand text-on-brand ring-surface",
                i > 0 && "-ml-1.5",
                i >= 4 && "max-sm:hidden", // phones show at most 4
              )}
              style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
            >
              {`${a.firstName[0] ?? ""}${a.lastName[0] ?? ""}`.toUpperCase()}
            </span>
          ))}
        </span>
      )}
      <p className={cn("min-w-0 truncate text-body-sm", dark ? "text-on-brand-muted" : "text-text-muted")}>
        <span className={cn("font-mono", dark ? "text-on-brand" : "text-text")}>{event.going}</span>
        {featured
          ? <span className={dark ? "text-on-brand" : undefined}><span className="hidden sm:inline"> Jackets</span> going</span>
          : compact ? <span className="sr-only"> going</span> : " going"}
        {phrase && !compact && (
          <>
            {" · "}
            {shortPhrase && <span className={cn("sm:hidden", dark ? "hl-brand text-on-brand" : "hl text-text")}>{shortPhrase}</span>}
            <span className={cn(shortPhrase && "hidden sm:inline", dark ? "hl-brand text-on-brand" : "hl text-text")}>{phrase}</span>
          </>
        )}
      </p>
    </div>
  );
}
