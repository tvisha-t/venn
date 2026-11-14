"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CirclePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL } from "./format";

export function HostCard({ city, className, compact = false }: { city: string; className?: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="host-h" className={cn("rounded-lg border border-dashed border-line-control bg-surface p-5", className)}>
      {!compact && (
        <>
          <h2 id="host-h" className="text-title-3">Host something small</h2>
          <p className="mt-1 text-body-sm text-text-muted">Trivia, a run, a dinner for six. Venn invites the Jackets nearby who&apos;d like it.</p>
        </>
      )}
      {compact && <h2 id="host-h" className="sr-only">Host an event</h2>}
      <Button variant="outline" className={cn("w-full", !compact && "mt-4")} onClick={() => setOpen(true)}>
        <CirclePlus aria-hidden /> Create a Jacket event
      </Button>
      <CreateEventDialog open={open} onOpenChange={setOpen} city={city} />
    </section>
  );
}

const FIELD = "h-11 w-full rounded-md border border-line-control bg-surface px-3 text-[15px] text-text outline-none focus:border-primary";

function CreateEventDialog({ open, onOpenChange, city }: { open: boolean; onOpenChange: (o: boolean) => void; city: string }) {
  const router = useRouter();
  const [hoods, setHoods] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ title: "", category: "member_hosted", date: "", time: "19:00", venueName: "", venueAddress: "", neighborhood: "", description: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  useEffect(() => {
    if (open && !hoods.length) api<{ neighborhoods: string[] }>("/api/events/cities").then((r) => setHoods(r.neighborhoods)).catch(() => {});
  }, [open, hoods.length]);
  const atlanta = city.toLowerCase() === "atlanta";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!f.title.trim() || !f.date || !f.time || !f.venueName.trim() || !f.venueAddress.trim()) { setErr("Fill in the title, date, time and venue."); return; }
    setBusy(true);
    try {
      const startsAt = new Date(`${f.date}T${f.time}`).toISOString(); // the host's local time
      const r = await api<{ id: string }>("/api/events", {
        method: "POST",
        json: { title: f.title, category: f.category, startsAt, venueName: f.venueName, venueAddress: f.venueAddress, neighborhood: atlanta && f.neighborhood ? f.neighborhood : null, city, description: f.description || null },
      });
      toast("Event created. You're going.");
      onOpenChange(false);
      router.push(`/events/${r.id}`);
    } catch (x) {
      setErr((x as Error).message);
    }
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Create a Jacket event</DialogTitle>
          <DialogDescription>Hosted by you, shown to Jackets in {city}. Keep it small and simple.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3" noValidate>
          <div>
            <label htmlFor="ev-title" className="mb-1 block text-[13px] font-semibold">Title</label>
            <input id="ev-title" className={FIELD} maxLength={80} value={f.title} onChange={set("title")} placeholder="Trivia night at…" />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label htmlFor="ev-cat" className="mb-1 block text-[13px] font-semibold">Type</label>
              <select id="ev-cat" className={FIELD} value={f.category} onChange={set("category")}>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{k === "member_hosted" ? "Other" : v}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ev-date" className="mb-1 block text-[13px] font-semibold">Date</label>
              <input id="ev-date" type="date" className={FIELD} value={f.date} onChange={set("date")} />
            </div>
            <div>
              <label htmlFor="ev-time" className="mb-1 block text-[13px] font-semibold">Time</label>
              <input id="ev-time" type="time" className={FIELD} value={f.time} onChange={set("time")} />
            </div>
          </div>
          <div>
            <label htmlFor="ev-venue" className="mb-1 block text-[13px] font-semibold">Venue name</label>
            <input id="ev-venue" className={FIELD} maxLength={120} value={f.venueName} onChange={set("venueName")} />
          </div>
          <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-3", atlanta && "sm:grid-cols-[minmax(0,1fr)_180px]")}>
            <div>
              <label htmlFor="ev-addr" className="mb-1 block text-[13px] font-semibold">Address</label>
              <input id="ev-addr" className={FIELD} maxLength={200} value={f.venueAddress} onChange={set("venueAddress")} />
            </div>
            {atlanta && (
              <div>
                <label htmlFor="ev-hood" className="mb-1 block text-[13px] font-semibold">Neighborhood</label>
                <select id="ev-hood" className={FIELD} value={f.neighborhood} onChange={set("neighborhood")}>
                  <option value="">Choose…</option>
                  {hoods.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            )}
          </div>
          <div>
            <label htmlFor="ev-desc" className="mb-1 block text-[13px] font-semibold">Short description <span className="font-normal text-text-subtle">(optional)</span></label>
            <textarea id="ev-desc" rows={3} maxLength={600} value={f.description} onChange={set("description")} className={cn(FIELD, "h-auto py-2")} />
          </div>
          <p className="text-body-sm text-text-subtle">The map pin goes at the neighborhood&apos;s center; the full address shows on the event page.</p>
          {err && <p role="alert" className="text-[13px] font-medium text-danger">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Create event</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
