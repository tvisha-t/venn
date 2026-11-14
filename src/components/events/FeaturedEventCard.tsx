"use client";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventItem } from "@/server/events";
import { VennMark } from "@/components/brand/VennMark";
import { DateTile } from "./DateTile";
import { GoingStack } from "./GoingStack";
import { whenShort } from "./format";

/** Navy brand panel for the biggest event in range. One gold RSVP button, nothing else. */
export function FeaturedEventCard({ event, label, onToggle }: { event: EventItem; label: string; onToggle: (e: EventItem) => void }) {
  return (
    <section aria-labelledby="featured-h" className="on-brand relative overflow-hidden rounded-xl bg-brand p-6 text-on-brand sm:p-7">
      <VennMark size={300} stroke="var(--on-brand)" overlap="var(--on-brand)" className="pointer-events-none absolute -right-10 -top-16 opacity-[0.07]" />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-eyebrow text-accent">{label}</p>
          <div className="mt-3 flex items-center gap-4">
            <DateTile iso={event.startsAt} dark />
            <div className="min-w-0">
              <h2 id="featured-h" className="text-[24px] font-extrabold leading-[30px] tracking-[-0.03em] sm:text-[30px] sm:leading-9">
                <Link href={`/events/${event.id}`} className="hover:underline underline-offset-4">{event.title}</Link>
              </h2>
              <p className="mt-1 text-body-sm text-on-brand-muted">
                {whenShort(event.startsAt)} · {event.neighborhood ?? event.city}
                {event.distanceMi != null && <> · <span className="font-mono">{event.distanceMi} mi</span></>} · {event.hostLabel}
              </p>
            </div>
          </div>
          <div className="mt-4"><GoingStack event={event} max={5} size={28} dark featured /></div>
        </div>
        <button
          type="button"
          aria-pressed={event.meGoing}
          aria-label={event.meGoing ? `Going to ${event.title}. Click to cancel your RSVP` : `RSVP to ${event.title}`}
          onClick={() => onToggle(event)}
          className={cn(
            "inline-flex h-12 w-full shrink-0 items-center justify-center gap-1.5 rounded-md px-6 text-[15px] font-bold transition-colors md:w-auto md:min-w-[200px]",
            event.meGoing ? "border border-on-brand bg-transparent text-on-brand hover:bg-brand-raised" : "bg-accent text-on-accent hover:bg-accent-hover",
          )}
        >
          {event.meGoing ? <><Check className="size-4" aria-hidden /> Going</> : "RSVP"}
        </button>
      </div>
    </section>
  );
}
