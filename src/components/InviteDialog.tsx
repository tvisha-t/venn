"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/** "Invite a Yellow Jacket": one email; the invitee's address isn't stored. */
export function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api<{ message: string }>("/api/invites", { method: "POST", json: { email, note: note || null } });
      toast.success(r.message);
      setEmail(""); setNote(""); onOpenChange(false);
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-surface">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-bold">Invite a Yellow Jacket</DialogTitle>
          <DialogDescription>We&apos;ll send one email inviting them to join. We don&apos;t keep their address, and they can turn off invites with one click.</DialogDescription>
        </DialogHeader>
        <form onSubmit={send} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="inv-email" className="block text-[14px] font-medium">Their email</label>
            <input id="inv-email" type="email" inputMode="email" required value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }}
              placeholder="friend@gatech.edu" aria-invalid={!!err} aria-describedby={err ? "inv-err" : undefined}
              className="h-10 w-full rounded-md border bg-surface px-3 text-[14px] outline-none focus:border-primary/40" />
            {err && <p id="inv-err" role="alert" className="text-[13px] text-danger">{err}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="inv-note" className="block text-[14px] font-medium">Add a note <span className="font-normal text-text-muted">(optional)</span></label>
            <textarea id="inv-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Thought you'd find this useful for meeting alumni in your field."
              className="block w-full resize-none rounded-md border bg-surface px-3 py-2 text-[14px] outline-none focus:border-primary/40" />
            <p className="text-right text-meta text-text-muted">{note.length}/300</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !email.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Send />} Send invite</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
