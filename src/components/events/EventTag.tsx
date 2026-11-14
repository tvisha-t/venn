import { cn } from "@/lib/utils";
import type { EventItem } from "@/server/events";

/** Host / category tag: network → host name, career, volunteer, or "Hosted by a Jacket". */
export function EventTag({ event, className }: { event: Pick<EventItem, "source" | "category" | "hostLabel">; className?: string }) {
  const [label, cls] =
    event.source === "member" ? ["Hosted by a Jacket", "bg-surface-raised text-text-muted"]
    : event.category === "career" ? ["Career", "bg-accent-soft text-accent-ink"]
    : event.category === "volunteer" ? ["Volunteer", "bg-success-soft text-success"]
    : [event.hostLabel, "bg-primary-soft text-primary-ink"];
  return <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-label", cls, className)}>{label}</span>;
}
