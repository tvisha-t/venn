"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Contact, Loader2, MessageSquareText, RotateCcw, Send, Share2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui-kit";
import { api } from "@/lib/api";

type Link = { code: string; url: string; joined: number };
type Picked = { name: string; tel: string } | null;

// Contact Picker API (Chrome on Android). The person picks ONE contact; the number goes straight into
// the sms: link on their own phone and is never sent to Venn.
type ContactsApi = { select: (props: string[], opts: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]> };
const contactsApi = (): ContactsApi | null =>
  typeof navigator !== "undefined" && "contacts" in navigator ? ((navigator as unknown as { contacts: ContactsApi }).contacts) : null;

export const inviteText = (url: string, first?: string) =>
  `Hey${first ? ` ${first}` : ""}! I'm on Venn, a Georgia Tech network for intros. You tell it who you need and it finds Yellow Jackets who can help, then sends the intro for you. Join with my link: ${url}`;

/** sms: link that works on iOS and Android. */
const smsHref = (tel: string, body: string) => `sms:${tel.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(body)}`;

function TextInvite({ active }: { active: boolean }) {
  const [link, setLink] = useState<Link | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [picked, setPicked] = useState<Picked>(null);
  const [copied, setCopied] = useState<"link" | "msg" | null>(null);
  const [canPick, setCanPick] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    setCanPick(!!contactsApi());
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);
  useEffect(() => {
    if (!active || link) return;
    api<Link>("/api/invites/link").then((l) => { setLink(l); setMsg(inviteText(l.url)); }).catch((e) => setErr(e.message));
  }, [active, link]);

  async function copy(what: "link" | "msg") {
    if (!link) return;
    try { await navigator.clipboard.writeText(what === "link" ? link.url : msg); setCopied(what); setTimeout(() => setCopied(null), 1600); }
    catch { toast.error("Couldn't copy. Select the text and copy it instead."); }
  }

  async function pick() {
    try {
      const [c] = await contactsApi()!.select(["name", "tel"], { multiple: false });
      if (!c?.tel?.[0]) return;
      const name = c.name?.[0] ?? "";
      setPicked({ name, tel: c.tel[0] });
      const first = name.split(" ")[0];
      setMsg((m) => m.replace(/^Hey( [^!]{1,40})?!/, `Hey${first ? ` ${first}` : ""}!`));
    } catch { /* cancelled */ }
  }

  async function share() {
    try { await navigator.share({ text: msg }); } catch { /* cancelled */ }
  }

  async function reset() {
    if (!confirm("Make a new link? Your current link will stop working. People who already joined still count.")) return;
    setResetting(true);
    try {
      const l = await api<Link>("/api/invites/link", { method: "POST", json: { action: "reset" } });
      setMsg((m) => m.replace(link!.url, l.url)); setLink(l); toast.success("New link ready.");
    } catch (e) { toast.error((e as Error).message); }
    setResetting(false);
  }

  if (err) return <p role="alert" className="text-body-sm text-danger">{err}</p>;
  if (!link) return <div className="grid h-40 place-items-center"><Loader2 className="size-5 animate-spin text-text-muted" aria-label="Loading your invite link" /></div>;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-[14px] font-medium">Your invite link</p>
        <div className="flex items-center gap-2 rounded-md border border-line bg-surface-raised py-1 pl-3 pr-1">
          <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{link.url.replace(/^https?:\/\//, "")}</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => copy("link")} aria-label="Copy invite link">
            {copied === "link" ? <Check /> : <Copy />} {copied === "link" ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="inv-msg" className="text-[14px] font-medium">Your text</label>
          {picked && <span className="text-body-sm text-text-muted">To {picked.name || picked.tel}</span>}
        </div>
        <textarea id="inv-msg" rows={5} maxLength={600} value={msg} onChange={(e) => setMsg(e.target.value)}
          className="block w-full resize-none rounded-md border border-line-control bg-surface px-3 py-2 text-[14px] leading-5 outline-none focus:border-primary" />
        {!msg.includes(link.url) && <p className="text-body-sm text-danger">Keep your link in the text so they can join.</p>}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {canPick && (
          <Button type="button" variant="outline" size="lg" onClick={pick}><Contact /> {picked ? "Change contact" : "Pick a contact"}</Button>
        )}
        <Button asChild size="lg" className={canPick ? "" : "sm:col-span-2"}>
          <a href={smsHref(picked?.tel ?? "", msg)}><MessageSquareText /> Open Messages</a>
        </Button>
        {canShare ? (
          <Button type="button" variant="outline" size="lg" onClick={share} className={canPick ? "sm:col-span-2" : ""}><Share2 /> Share another way</Button>
        ) : (
          <Button type="button" variant="outline" size="lg" onClick={() => copy("msg")} className={canPick ? "sm:col-span-2" : ""}>
            {copied === "msg" ? <Check /> : <Copy />} {copied === "msg" ? "Copied" : "Copy text"}
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-body-sm">
        <p className="text-text-muted">
          <span className="font-mono text-text">{link.joined}</span> {link.joined === 1 ? "person has" : "people have"} joined with your link
        </p>
        <button type="button" onClick={reset} disabled={resetting} className="inline-flex items-center gap-1 text-text-muted hover:text-text disabled:opacity-60">
          <RotateCcw className="size-3.5" aria-hidden /> New link
        </button>
      </div>
      <p className="text-body-sm text-text-subtle">The text comes from your phone. Venn never sees your contacts or their numbers.</p>
    </div>
  );
}

function EmailInvite({ onDone }: { onDone: () => void }) {
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
      setEmail(""); setNote(""); onDone();
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }

  return (
    <form onSubmit={send} className="space-y-3" noValidate>
      <p className="text-body-sm text-text-muted">We&apos;ll send one email. We don&apos;t keep their address, and they can turn off invites with one click.</p>
      <div className="space-y-1.5">
        <label htmlFor="inv-email" className="block text-[14px] font-medium">Their email</label>
        <input id="inv-email" type="email" inputMode="email" required value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }}
          placeholder="friend@gatech.edu" aria-invalid={!!err} aria-describedby={err ? "inv-err" : undefined}
          className="h-10 w-full rounded-md border border-line-control bg-surface px-3 text-[14px] outline-none focus:border-primary" />
        {err && <p id="inv-err" role="alert" className="text-[13px] text-danger">{err}</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="inv-note" className="block text-[14px] font-medium">Add a note <span className="font-normal text-text-muted">(optional)</span></label>
        <textarea id="inv-note" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Thought you'd find this useful for meeting alumni in your field."
          className="block w-full resize-none rounded-md border border-line-control bg-surface px-3 py-2 text-[14px] outline-none focus:border-primary" />
        <p className="text-right text-meta text-text-muted">{note.length}/300</p>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={busy || !email.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Send />} Send invite</Button>
      </DialogFooter>
    </form>
  );
}

/** "Invite a Yellow Jacket": text a personal link from your own phone, or send one email. */
export function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [tab, setTab] = useState<"text" | "email">("text");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-surface">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-bold">Invite a Yellow Jacket</DialogTitle>
          <DialogDescription>Know someone from Tech who should be here? Text them your link. When they join, it shows up here.</DialogDescription>
        </DialogHeader>
        <Segmented label="How to invite" value={tab} onChange={setTab} options={[{ value: "text", label: "Text" }, { value: "email", label: "Email" }]} />
        {tab === "text" ? <TextInvite active={open} /> : <EmailInvite onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
