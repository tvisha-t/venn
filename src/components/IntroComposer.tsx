"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Minimize2, Send, Smile } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { PersonAvatar } from "@/components/PersonAvatar";
import { titleCompany } from "@/components/ResultRow";
import { api, ApiError, type PublicProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

type Draft = { introId: string; subject: string; body: string; senderContext: string; source: "llm" | "rules" };

export function IntroComposer({
  recipient, goalId, onClose, onSent,
}: { recipient: PublicProfile | null; goalId?: string | null; onClose: () => void; onSent?: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"shorter" | "warmer" | "send" | null>(null);
  const [suppressed, setSuppressed] = useState(false);
  const [tab, setTab] = useState<"write" | "preview">("write");

  function load() {
    if (!recipient) return;
    setDraft(null); setErr(null); setSuppressed(false); setTab("write");
    api<Draft>("/api/intros/draft", { method: "POST", json: { recipientId: recipient.id, goalId: goalId ?? null } })
      .then((d) => { setDraft(d); setSubject(d.subject); setBody(d.body); })
      .catch((e) => setErr(e.message));
  }
  useEffect(load, [recipient?.id, goalId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function rewrite(mode: "shorter" | "warmer") {
    if (!draft) return;
    setBusy(mode);
    try {
      const r = await api<{ subject: string; body: string }>("/api/intros/rewrite", { method: "POST", json: { introId: draft.introId, mode, subject, body } });
      setSubject(r.subject); setBody(r.body);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }

  async function send() {
    if (!draft) return;
    setBusy("send");
    try {
      const r = await api<{ status: string }>(`/api/intros/${draft.introId}/send`, { method: "POST", json: { subject, body, userConfirmed: true } });
      if (r.status === "suppressed") { setSuppressed(true); setBusy(null); return; }
      toast.success(`Intro sent to ${recipient!.firstName}. We'll tell you when they reply.`);
      onSent?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't send. Your draft is saved.");
    }
    setBusy(null);
  }

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const unclaimed = recipient?.status === "unclaimed";
  const over = words > 120;

  return (
    <Sheet open={!!recipient} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 bg-surface p-0 sm:max-w-[560px]">
        <header className="flex items-center gap-3 border-b px-5 py-4 pr-12">
          {recipient && <PersonAvatar first={recipient.firstName} last={recipient.lastName} size={36} />}
          <div className="min-w-0">
            <SheetTitle className="text-cardtitle">Intro to {recipient?.firstName} {recipient?.lastName}</SheetTitle>
            <SheetDescription className="truncate text-meta text-ink-2">{recipient ? titleCompany(recipient) : ""}</SheetDescription>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {err && <ErrorState message={err} onRetry={load} />}
          {!draft && !err && (
            <div role="status" aria-label="Drafting" className="space-y-3">
              <p className="flex items-center gap-2 text-ink-2"><Loader2 className="size-4 animate-spin" aria-hidden /> Venn is drafting your intro…</p>
              <Skeleton className="h-9 w-full" /><Skeleton className="h-48 w-full" />
            </div>
          )}

          {suppressed && (
            <div className="space-y-3 rounded-lg bg-warn-bg px-4 py-3">
              <p className="font-medium text-warn">We don&apos;t have a way to email {recipient?.firstName}.</p>
              <p className="text-ink">Copy your message and find them on LinkedIn instead.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { navigator.clipboard.writeText(body); toast.success("Message copied"); }}><Copy /> Copy message</Button>
                <Button size="sm" variant="outline" asChild>
                  <a target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${recipient?.firstName} ${recipient?.lastName} Georgia Tech`)}`}><ExternalLink /> Open LinkedIn search</a>
                </Button>
              </div>
            </div>
          )}

          {draft && !suppressed && (
            <div className="space-y-4">
              <div role="tablist" aria-label="Composer" className="flex gap-4 border-b">
                {(["write", "preview"] as const).map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                    className={cn("-mb-px border-b-2 px-0.5 pb-2 text-[13px] font-medium", tab === t ? "border-brand text-ink" : "border-transparent text-ink-2 hover:text-ink")}>
                    {t === "write" ? "Write" : "Email preview"}
                  </button>
                ))}
              </div>

              {tab === "write" ? (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="subj" className="mb-1 block text-[13px] font-medium text-ink-2">Subject</label>
                    <input id="subj" value={subject} maxLength={80} onChange={(e) => setSubject(e.target.value)}
                      className="h-10 w-full rounded-md border bg-surface px-3 text-[14px] font-medium outline-none focus:border-brand/30" />
                  </div>
                  <div>
                    <label htmlFor="body" className="mb-1 block text-[13px] font-medium text-ink-2">Message</label>
                    <textarea id="body" rows={12} value={body} onChange={(e) => setBody(e.target.value)}
                      className="block w-full resize-y rounded-md border bg-surface px-3 py-2.5 text-[14px] leading-6 outline-none focus:border-brand/30" />
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => rewrite("shorter")} disabled={!!busy}>
                      {busy === "shorter" ? <Loader2 className="animate-spin" /> : <Minimize2 />} Shorter
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => rewrite("warmer")} disabled={!!busy}>
                      {busy === "warmer" ? <Loader2 className="animate-spin" /> : <Smile />} Warmer
                    </Button>
                    <span className={cn("ml-auto text-meta tabular-nums", over ? "font-medium text-danger" : "text-ink-2")} aria-live="polite">{words} / 120 words</span>
                  </div>
                  <p className="text-meta text-ink-2">No emails, phone numbers or links: Venn adds the reply instructions.</p>
                </div>
              ) : (
                <section aria-label="Email preview" className="overflow-hidden rounded-lg border bg-surface">
                  <dl className="grid grid-cols-[72px_1fr] gap-y-0.5 border-b bg-muted/50 px-4 py-2.5 text-meta">
                    <dt className="text-ink-2">From</dt><dd>You via Venn</dd>
                    <dt className="text-ink-2">Reply-To</dt><dd>Private Venn relay</dd>
                    <dt className="text-ink-2">Subject</dt><dd className="font-medium">{subject}</dd>
                  </dl>
                  <div className="brand-rule px-4 py-4 text-[14px] leading-6">
                    <p className="whitespace-pre-wrap">{body}</p>
                    <p className="mt-3 text-ink-2">— {draft.senderContext}</p>
                    <div className="mt-4 border-t pt-3">
                      <p className="font-medium">Reply to connect.</p>
                      <p className="text-meta text-ink-2">Replying shares their email with you. &ldquo;Not interested&rdquo; shares nothing.</p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-meta">
                        <span className="rounded-md border px-2 py-1">Not interested</span>
                        {unclaimed && <><span className="rounded-md border px-2 py-1">Claim your profile</span><span className="rounded-md border px-2 py-1">Remove me from Venn</span></>}
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {draft && !suppressed && (
          <footer className="flex items-center gap-3 border-t bg-surface px-5 py-3">
            <p className="hidden text-meta text-ink-2 sm:block">One intro per person · one reminder after 5 days</p>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={send} disabled={!!busy || words === 0 || over || !subject.trim()}>
                {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />} Send intro
              </Button>
            </div>
          </footer>
        )}
      </SheetContent>
    </Sheet>
  );
}
