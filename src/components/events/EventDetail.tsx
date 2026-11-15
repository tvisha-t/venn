"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, Check, ChevronLeft, ExternalLink, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventDetail as Detail } from "@/server/events";
import { PersonAvatar } from "@/components/PersonAvatar";
import { DateTile } from "./DateTile";
import { EventTag } from "./EventTag";
import { directionsUrl, whenRange } from "./format";
import { rsvpToggle } from "./useRsvp";

export function EventDetail({ initial }: { initial: Detail }) {
  const [e, setE] = useState(initial);
  const [showAll, setShowAll] = useState(false);
  const toggle = () => rsvpToggle(e, (going, delta) => setE((x) => ({ ...x, meGoing: going, going: Math.max(0, x.going + delta) })));
  const knowIds = new Set(e.youllKnow.map((p) => p.id));
  const rest = e.attendees.filter((p) => !knowIds.has(p.id));

  return (
    <div className="mx-auto max-w-[720px] pb-24 md:pb-0">
      {/* Navy header (full-bleed on phones) */}
      <header className="on-brand -mx-5 -mt-6 bg-brand px-5 pb-7 pt-5 text-on-brand sm:mx-0 sm:mt-0 sm:rounded-xl sm:px-7">
        <div className="flex items-center justify-between">
          <Link href="/events" className="grid size-11 place-items-center rounded-md border border-brand-line bg-brand-raised" aria-label="Back to events">
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <EventTag event={e} />
        </div>
        <div className="mt-5 flex items-center gap-4">
          <DateTile iso={e.startsAt} dark />
          <div className="min-w-0">
            <h1 className="text-[24px] font-extrabold leading-[30px] tracking-[-0.03em]">{e.title}</h1>
            <p className="mt-1 text-body-sm text-on-brand-muted">
              {whenRange(e.startsAt, e.endsAt)} · {e.neighborhood ?? e.city}
              {e.distanceMi != null && <> · <span className="font-mono">{e.distanceMi} mi</span></>}
            </p>
          </div>
        </div>
      </header>

      <div className="mt-4 space-y-4">
        <section aria-labelledby="about-h" className="rounded-lg border border-line bg-surface p-5 shadow-card">
          <h2 id="about-h" className="text-title-3">About</h2>
          {e.description && <p className="mt-2 text-text-muted">{e.description}</p>}
          <p className="mt-2 text-body-sm text-text-muted">{e.venueName} · {e.venueAddress}</p>
          <p className="mt-1 text-body-sm text-text-muted">Hosted by {e.hostIsMe ? "you" : e.hostLabel}</p>
          <a href={directionsUrl(e.venueAddress)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-body-sm font-semibold text-link underline underline-offset-2">
            <MapPin className="size-4" aria-hidden /> Venue address and directions
          </a>
          {e.externalUrl && (
            <a href={e.externalUrl} target="_blank" rel="noopener noreferrer" className="ml-4 inline-flex min-h-11 items-center gap-1.5 text-body-sm font-semibold text-link underline underline-offset-2">
              <ExternalLink className="size-4" aria-hidden /> Event page
            </a>
          )}
          {e.isDemo && <p className="mt-2 text-[12px] text-text-subtle">Demo event (fictional venue).</p>}
        </section>

        <section aria-labelledby="know-h" className="rounded-lg border border-line bg-surface p-5 shadow-card">
          <div className="flex items-center justify-between">
            <h2 id="know-h" className="text-title-3">{e.youllKnow.length ? "You'll know someone" : "Who's going"}</h2>
            <span className="text-mono-sm text-text-muted">{e.going} going</span>
          </div>
          {e.youllKnow.length > 0 ? (
            <ul className="mt-2 divide-y divide-line">
              {e.youllKnow.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <PersonAvatar first={p.firstName} last={p.lastName} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-strong">{p.firstName} {p.lastName}</p>
                    <p className="truncate text-body-sm text-text-muted">{p.role}</p>
                  </div>
                  <span className="hl shrink-0 text-body-sm text-text">{p.item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-body-sm text-text-muted">{e.attendees.length ? "No one here shares a club, program or major with you yet." : "Be the first Jacket on Venn to RSVP."}</p>
          )}
          {rest.length > 0 && (
            showAll ? (
              <ul className="mt-1 divide-y divide-line border-t border-line">
                {rest.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-2.5">
                    <PersonAvatar first={p.firstName} last={p.lastName} size={32} />
                    <p className="min-w-0 flex-1 truncate text-body-sm"><span className="font-semibold text-text">{p.firstName} {p.lastName}</span> <span className="text-text-muted">· {p.role}</span></p>
                  </li>
                ))}
              </ul>
            ) : (
              <button type="button" onClick={() => setShowAll(true)} className="mt-1 min-h-11 text-body-sm font-semibold text-link underline underline-offset-2">See everyone going</button>
            )
          )}
          {e.going > e.attendees.length + (e.meGoing ? 1 : 0) && (
            <p className="mt-1 text-[12px] text-text-subtle">Only members who published their profile are shown.</p>
          )}
        </section>
      </div>

      {/* Sticky footer on phones; inline on desktop */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-line bg-surface px-5 py-3 md:static md:mt-4 md:border-0 md:bg-transparent md:px-0 md:py-0">
        <div className="mx-auto flex max-w-[720px] items-center gap-3">
          <a href={`/api/events/${e.id}/ics`} className="grid size-12 shrink-0 place-items-center rounded-md border border-line-control bg-surface text-text hover:bg-surface-raised" aria-label="Add to calendar (.ics)">
            <CalendarPlus className="size-5" aria-hidden />
          </a>
          <button
            type="button" onClick={toggle} aria-pressed={e.meGoing}
            aria-label={e.meGoing ? `Going to ${e.title}. Click to cancel your RSVP` : `RSVP to ${e.title}`}
            className={cn("inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-md text-[15px] font-bold transition-colors",
              e.meGoing ? "bg-success-soft text-success" : "bg-primary text-on-primary hover:bg-primary-hover")}
          >
            {e.meGoing ? <><Check className="size-4" aria-hidden /> Going</> : "RSVP"}
          </button>
        </div>
        {e.externalUrl && !e.meGoing && <p className="mx-auto mt-1.5 max-w-[720px] text-[12px] text-text-subtle">RSVP also opens the event page to register.</p>}
      </div>
    </div>
  );
}
