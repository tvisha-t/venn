"use client";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { EventItem } from "@/server/events";

// Requests for the same event go out strictly in order, so a quick RSVP → un-RSVP can't
// arrive at the server reversed (which would leave the opposite of what the screen shows).
const queues = new Map<string, Promise<unknown>>();

/**
 * Optimistic RSVP toggle. `apply` updates local state immediately; on failure it is reverted.
 * Network events with an official page: RSVP in Venn AND open the registration page (in the click handler,
 * so pop-up blockers allow it).
 */
export function rsvpToggle(event: Pick<EventItem, "id" | "meGoing" | "going" | "externalUrl" | "source">, apply: (going: boolean, delta: number) => void) {
  const next = !event.meGoing;
  if (next && event.externalUrl && event.source === "network") {
    window.open(event.externalUrl, "_blank", "noopener,noreferrer");
    toast("Also register on the Alumni Association page.");
  }
  apply(next, next ? 1 : -1);
  const prev = queues.get(event.id) ?? Promise.resolve();
  const run = prev
    .catch(() => {})
    .then(() => api(`/api/events/${event.id}/rsvp`, { method: next ? "POST" : "DELETE" }))
    .catch((e) => {
      apply(!next, next ? -1 : 1);
      toast.error((e as Error).message || "Couldn't update your RSVP.");
    });
  queues.set(event.id, run);
  run.finally(() => { if (queues.get(event.id) === run) queues.delete(event.id); });
}
