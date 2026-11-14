"use client";
import Link from "next/link";
import { Check, ChevronRight, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventItem } from "@/server/events";
import { DateTile } from "./DateTile";
import { EventTag } from "./EventTag";
import { GoingStack } from "./GoingStack";
import { whenShort } from "./format";

/** One event in the list. The title is a stretched link to the detail; RSVP sits above it. */
export function EventRow({
  event, index, active, onHover, onToggle,
}: { event: EventItem; index: number; active: boolean; onHover: (id: string | null) => void; onToggle: (e: EventItem) => void }) {
  return (
    <li
      onMouseEnter={() => onHover(event.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "relative flex items-center gap-4 rounded-lg border bg-surface px-4 py-4 shadow-card transition-colors sm:px-5",
        active ? "border-primary" : "border-line",
      )}
    >
      <span className="sr-only">Event {index + 1}.</span>
      <DateTile iso={event.startsAt} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={`/events/${event.id}`} className="min-w-0 truncate text-[17px] font-bold leading-[22px] after:absolute after:inset-0 after:rounded-lg">
            {event.title}
          </Link>
          <EventTag event={event} className="hidden sm:inline-flex" />
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-body-sm text-text-muted">
          <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden /> {whenShort(event.startsAt)}</span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden /> {event.neighborhood ?? event.city}
            {event.distanceMi != null && <span className="font-mono text-text">{event.distanceMi} mi</span>}
          </span>
        </p>
        <div className="mt-2 hidden sm:block"><GoingStack event={event} /></div>
        <div className="mt-2 sm:hidden"><GoingStack event={event} compact size={22} /></div>
      </div>
      <div className="relative z-10 hidden shrink-0 sm:block">
        <RsvpButton event={event} onToggle={onToggle} />
      </div>
      <ChevronRight className="size-5 shrink-0 text-text-subtle sm:hidden" aria-hidden />
    </li>
  );
}

export function RsvpButton({ event, onToggle, className }: { event: EventItem; onToggle: (e: EventItem) => void; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={event.meGoing}
      aria-label={event.meGoing ? `Going to ${event.title}. Click to cancel your RSVP` : `RSVP to ${event.title}`}
      onClick={() => onToggle(event)}
      className={cn(
        "inline-flex h-11 min-w-[88px] items-center justify-center gap-1.5 rounded-md px-4 text-body-strong transition-colors",
        event.meGoing ? "bg-success-soft text-success hover:opacity-90" : "border border-line-control bg-surface text-text hover:bg-surface-raised",
        className,
      )}
    >
      {event.meGoing ? <><Check className="size-4" aria-hidden /> Going</> : "RSVP"}
    </button>
  );
}
