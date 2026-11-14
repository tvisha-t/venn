"use client";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { EventItem } from "@/server/events";

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
  api(`/api/events/${event.id}/rsvp`, { method: next ? "POST" : "DELETE" }).catch((e) => {
    apply(!next, next ? -1 : 1);
    toast.error((e as Error).message || "Couldn't update your RSVP.");
  });
}
