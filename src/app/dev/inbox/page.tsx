"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Clock, Inbox, RefreshCw, Reply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, LoadingCards } from "@/components/states";
import { api } from "@/lib/api";

type Email = {
  id: string; introId: string | null; mailbox: "recipient" | "sender" | "invitee"; fromName: string; replyToLabel: string | null; subject: string;
  html: string; text: string; kind: string; createdAt: string; toName: string; toStatus: string; introStatus: string | null;
};

// Sandbox mailbox (EMAIL_MODE=sandbox). Plays the recipient: click links or Reply.
export default function DevInbox() {
  const [emails, setEmails] = useState<Email[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [reply, setReply] = useState("Happy to help! I'm free Thursday afternoon for a quick call.");
  const [busy, setBusy] = useState(false);

  function load() {
    setErr(null);
    api<{ emails: Email[] }>("/api/dev/inbox").then((r) => { setEmails(r.emails); setSel((s) => s ?? r.emails[0]?.id ?? null); }).catch((e) => setErr(e.message));
  }
  useEffect(load, []);
  const e = emails?.find((x) => x.id === sel);

  async function sendReply() {
    if (!e) return;
    setBusy(true);
    try { await api(`/api/dev/inbox/${e.id}/reply`, { method: "POST", json: { text: reply } }); toast.success("Reply sent through the relay"); load(); }
    catch (x) { toast.error((x as Error).message); }
    setBusy(false);
  }
  async function timeTravel() {
    const r = await api<{ reminders: { reminded: number; noResponse: number }; standing: { added: number } }>("/api/dev/time-travel", { method: "POST", json: { days: 5 } });
    toast.success(`+5 days: ${r.reminders.reminded} reminders, ${r.reminders.noResponse} marked no response, ${r.standing.added} new standing-goal matches`);
    load();
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="on-brand bg-brand text-on-brand">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="flex items-center gap-2 font-semibold"><Inbox className="size-5" aria-hidden /> Sandbox inbox <span className="rounded bg-accent-soft text-accent-ink px-1.5 text-xs font-bold text-primary">EMAIL_MODE=sandbox</span></p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={load}><RefreshCw /> Refresh</Button>
            <Button size="sm" variant="secondary" onClick={timeTravel}><Clock /> Simulate 5 days passing</Button>
            <Button size="sm" variant="secondary" asChild><Link href="/home">Back to Venn</Link></Button>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        <p className="mb-4 text-sm text-text-muted">Emails to fictional people land here instead of a real inbox. You&apos;re playing the recipient: reply, or click the links in the email. Recipients are shown by name only.</p>
        {err && <ErrorState message={err} onRetry={load} />}
        {!emails && !err && <LoadingCards n={2} />}
        {emails?.length === 0 && <EmptyState title="No emails yet">Send an intro from Venn and it will appear here.</EmptyState>}
        {emails && emails.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
            <ul className="max-h-[75vh] space-y-2 overflow-y-auto" aria-label="Emails">
              {emails.map((m) => (
                <li key={m.id}>
                  <button onClick={() => setSel(m.id)} aria-current={sel === m.id} className={`w-full rounded-lg border bg-surface p-3 text-left text-sm ${sel === m.id ? "border-line-control ring-2 ring-accent/40" : ""}`}>
                    <p className="flex justify-between gap-2"><span className="font-semibold">To: {m.toName}</span><span className="text-xs text-text-muted">{m.kind.replace("_", " ")}</span></p>
                    <p className="line-clamp-1">{m.subject}</p>
                    <p className="text-xs text-text-muted">From {m.fromName}{m.introStatus ? ` · intro: ${m.introStatus.replace("_", " ")}` : ""}</p>
                  </button>
                </li>
              ))}
            </ul>
            {e && (
              <section className="space-y-3">
                <div className="rounded-lg border bg-surface p-3 text-sm">
                  <p><strong>From:</strong> {e.fromName} · <strong>To:</strong> {e.toName} ({e.mailbox === "recipient" ? (e.toStatus === "unclaimed" ? "unclaimed alum" : "member") : e.mailbox === "invitee" ? "invitee, not on Venn yet" : "the sender"})</p>
                  <p><strong>Reply-To:</strong> {e.replyToLabel}</p>
                  <p><strong>Subject:</strong> {e.subject}</p>
                </div>
                <iframe title="Email body" srcDoc={e.html} sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" className="h-[460px] w-full rounded-lg border bg-surface" />
                {e.mailbox === "recipient" && e.introId && (
                  <div className="space-y-2 rounded-lg border bg-surface p-3">
                    <label htmlFor="reply" className="flex items-center gap-1.5 text-sm font-semibold"><Reply className="size-4" aria-hidden /> Reply as {e.toName}</label>
                    <Textarea id="reply" rows={3} value={reply} onChange={(x) => setReply(x.target.value)} />
                    <Button onClick={sendReply} disabled={busy || !reply.trim()}>Send reply</Button>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
