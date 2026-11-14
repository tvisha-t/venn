"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Eye, Loader2, Lock, PenLine, RefreshCw, Send, Smile } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { PersonAvatar } from "@/components/PersonAvatar";
import { VennLogo } from "@/components/brand/VennLogo";
import { titleCompany } from "@/components/ResultRow";
import { useMe } from "@/components/AppShell";
import { overlap } from "@/lib/overlap";
import { api, ApiError, type PublicProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

type Draft = { introId: string; subject: string; body: string; senderContext: string; source: "llm" | "rules" };

export function IntroComposer({
  recipient, goalId, onClose, onSent,
}: { recipient: PublicProfile | null; goalId?: string | null; onClose: () => void; onSent?: () => void }) {
  const { me } = useMe();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"shorter" | "warmer" | "send" | null>(null);
  const [suppressed, setSuppressed] = useState(false);
  const [preview, setPreview] = useState(false);

  function load() {
    if (!recipient) return;
    setDraft(null); setErr(null); setSuppressed(false); setPreview(false);
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
      toast.success(`Request sent to ${recipient!.firstName}. We'll tell you when they reply.`);
      onSent?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't send. Your draft is saved.");
    }
    setBusy(null);
  }

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const over = words > 120;
  const first = recipient?.firstName ?? "";
  const shared = recipient ? overlap(me?.profile, recipient, 2) : [];
  const unclaimed = recipient?.status === "unclaimed";

  return (
    <Dialog open={!!recipient} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px] sm:p-0">
        <div className="space-y-1 px-6 pb-4 pt-6 pr-16 sm:px-8 sm:pt-8">
          <p className="text-eyebrow text-accent-text">Request an intro</p>
          <DialogTitle className="text-title-2">Say hi to {first}</DialogTitle>
          <DialogDescription className="sr-only">Venn drafted this message. Edit anything, then send. Nothing goes out until you click Send request.</DialogDescription>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-6 sm:px-8">
          {recipient && (
            <div className="flex items-center gap-3 rounded-md border border-line p-3">
              <PersonAvatar first={recipient.firstName} last={recipient.lastName} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-title-3">{recipient.firstName} {recipient.lastName}</p>
                <p className="truncate text-body-sm text-text-muted">{titleCompany(recipient)}</p>
              </div>
              {shared.length > 0 && (
                <p className="hidden shrink-0 text-body-sm sm:block">{shared.map((x, i) => <span key={x}>{i > 0 && " · "}<span className="hl">{x}</span></span>)}</p>
              )}
            </div>
          )}

          {err && <ErrorState message={err} onRetry={load} />}
          {!draft && !err && (
            <div role="status" aria-label="Drafting" className="space-y-3">
              <p className="flex items-center gap-2 text-text-muted"><Loader2 className="size-4 animate-spin" aria-hidden /> Venn is drafting your message…</p>
              <Skeleton className="h-11 w-full" /><Skeleton className="h-44 w-full" />
            </div>
          )}

          {suppressed && (
            <div className="space-y-3 rounded-md bg-accent-soft px-4 py-3 text-accent-ink">
              <p className="font-semibold">We don&apos;t have a way to email {first}.</p>
              <p>Copy your message and find them on LinkedIn instead.</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { navigator.clipboard.writeText(body); toast.success("Message copied"); }}><Copy /> Copy message</Button>
                <Button size="sm" variant="outline" asChild>
                  <a target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${recipient?.firstName} ${recipient?.lastName} Georgia Tech`)}`}><ExternalLink /> Open LinkedIn search</a>
                </Button>
              </div>
            </div>
          )}

          {draft && !suppressed && !preview && (
            <>
              <div className="space-y-1.5">
                <label htmlFor="subj" className="block text-[13px] font-semibold">Subject</label>
                <input id="subj" value={subject} maxLength={80} onChange={(e) => setSubject(e.target.value)}
                  className="h-12 w-full rounded-md border border-line-control bg-surface px-4 text-[15px] text-text outline-none focus:border-primary" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="body" className="text-[13px] font-semibold">Message</label>
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-label text-accent-ink"><PenLine className="size-3.5" aria-hidden /> Drafted by Venn, edit anything</span>
                </div>
                <textarea id="body" rows={8} value={body} onChange={(e) => setBody(e.target.value)}
                  className="block w-full resize-y rounded-md border border-line-control bg-surface px-4 py-3 text-[15px] leading-[22px] text-text outline-none focus:border-primary" />
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => rewrite("shorter")} disabled={!!busy}>
                    {busy === "shorter" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Rewrite shorter
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => rewrite("warmer")} disabled={!!busy}>
                    {busy === "warmer" ? <Loader2 className="animate-spin" /> : <Smile />} Warmer
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPreview(true)}><Eye /> Preview email</Button>
                  <span className={cn("ml-auto text-mono-sm", over ? "font-medium text-danger" : "text-text-subtle")} aria-live="polite">{words} / 120 words</span>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md bg-surface-raised p-4">
                  <p className="text-title-3">{first} will see</p>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-body-sm text-text-muted">
                    <li>Your name, major and year</li>
                    <li>This message</li>
                    <li>Reply and &ldquo;Not interested&rdquo; buttons</li>
                  </ul>
                </div>
                <div className="rounded-md bg-primary-soft p-4 text-primary-ink">
                  <p className="flex items-center gap-1.5 text-title-3"><Lock className="size-4" aria-hidden /> Stays private</p>
                  <p className="mt-1.5 text-body-sm">Your email and phone. You&apos;ll swap contacts only if {first} replies.</p>
                </div>
              </div>
            </>
          )}

          {draft && !suppressed && preview && (
            <section aria-label="Email preview" className="overflow-hidden rounded-md border border-line">
              <div className="flex items-center justify-between bg-brand px-5 py-4 text-on-brand">
                <VennLogo size="mobile" onBrand href={null} />
                <span className="text-eyebrow text-accent">Intro request</span>
              </div>
              <dl className="grid grid-cols-[72px_1fr] gap-y-0.5 border-b border-line bg-surface-raised px-5 py-2.5 text-body-sm">
                <dt className="text-text-muted">From</dt><dd>{me?.profile.firstName ?? "You"} via Venn</dd>
                <dt className="text-text-muted">Reply-To</dt><dd>Private Venn relay</dd>
                <dt className="text-text-muted">Subject</dt><dd className="font-semibold">{subject}</dd>
              </dl>
              <div className="space-y-3 px-5 py-4">
                <p className="whitespace-pre-wrap">{body}</p>
                <p className="text-text-muted">— {draft.senderContext}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="rounded-md bg-primary px-4 py-2 text-body-sm font-semibold text-on-primary">Reply to connect</span>
                  <span className="rounded-md border border-line-control px-4 py-2 text-body-sm font-semibold">Not interested</span>
                </div>
                {unclaimed && <p className="text-body-sm text-text-subtle">Includes &ldquo;Claim your profile&rdquo; and &ldquo;Remove me from Venn&rdquo; links.</p>}
              </div>
              <div className="border-t border-line px-5 py-2"><Button variant="ghost" size="sm" onClick={() => setPreview(false)}><PenLine /> Back to editing</Button></div>
            </section>
          )}
        </div>

        {draft && !suppressed && (
          <footer className="flex flex-wrap items-center gap-3 border-t border-line px-6 py-4 sm:px-8">
            <p className="min-w-0 flex-1 text-body-sm text-text-muted">{first} gets <strong className="font-semibold text-text">one</strong> email, plus one reminder if there&apos;s no reply in 5 days.</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={send} disabled={!!busy || words === 0 || over || !subject.trim()}>
                {busy === "send" ? <Loader2 className="animate-spin" /> : null} Send request {busy !== "send" && <Send />}
              </Button>
            </div>
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}
