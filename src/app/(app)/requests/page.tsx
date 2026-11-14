"use client";
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Info, Lightbulb, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingRows } from "@/components/states";
import { IntroComposer } from "@/components/IntroComposer";
import { ProfileSheet } from "@/components/ProfileSheet";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Segmented } from "@/components/ui-kit";
import { useMe } from "@/components/AppShell";
import { api, type IntroStatus, type Match, type PublicProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

type Intro = {
  id: string; status: IntroStatus; subject: string | null; message: string; replyPreview: string | null; unseen: boolean;
  goalId: string | null; sentAt: string | null; reminderSentAt: string | null; repliedAt: string | null;
  recipient: { id: string; firstName: string; lastName: string; jobTitle: string | null; employer: string | null; classYear: number | null; status: string } | null;
};

const BADGE: Record<IntroStatus, { label: string; cls: string; dot: string }> = {
  draft: { label: "Draft", cls: "bg-surface-raised text-text-subtle", dot: "bg-text-subtle" },
  sent: { label: "Sent", cls: "bg-accent-soft text-accent-ink", dot: "bg-accent-ink" },
  replied: { label: "Replied", cls: "bg-success-soft text-success", dot: "bg-success" },
  no_response: { label: "No response", cls: "bg-surface-raised text-text-subtle", dot: "bg-text-subtle" },
  not_interested: { label: "Not interested", cls: "bg-transparent px-0 text-text-subtle", dot: "border border-text-subtle bg-transparent" },
  bounced: { label: "Couldn't deliver", cls: "bg-surface-raised text-text-subtle", dot: "bg-text-subtle" },
  suppressed: { label: "No email on file", cls: "bg-surface-raised text-text-subtle", dot: "bg-text-subtle" },
};

function StatusBadge({ status }: { status: IntroStatus }) {
  const b = BADGE[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-1 text-label", b.cls)}>
      <span className={cn("size-1.5 rounded-full", b.dot)} aria-hidden />{b.label}
    </span>
  );
}

function updatedAt(i: Intro) {
  const d = i.repliedAt ?? i.reminderSentAt ?? i.sentAt;
  if (!d) return "";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Tab = "all" | "sent" | "replied" | "not_interested" | "no_response";
const inTab = (i: Intro, t: Tab) => t === "all" || i.status === t || (t === "no_response" && ["no_response", "bounced", "suppressed"].includes(i.status));

export default function Requests() {
  const { refresh } = useMe();
  const [intros, setIntros] = useState<Intro[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [nextBest, setNextBest] = useState<Record<string, Match | null>>({});
  const [compose, setCompose] = useState<{ p: PublicProfile; goalId: string | null } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function load() {
    setErr(null);
    api<{ intros: Intro[] }>("/api/intros").then((r) => {
      setIntros(r.intros);
      if (r.intros.some((i) => i.unseen)) api("/api/intros/seen", { method: "POST" }).then(refresh).catch(() => {});
    }).catch((e) => setErr(e.message));
  }
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live status: while any request is still open, re-check every 5s so a reply flips it to "Replied" on screen.
  const waiting = intros?.some((i) => i.status === "sent") ?? false;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      api<{ intros: Intro[] }>("/api/intros").then((r) => {
        setIntros(r.intros);
        if (r.intros.some((i) => i.unseen)) api("/api/intros/seen", { method: "POST" }).then(refresh).catch(() => {});
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [waiting, refresh]);

  async function suggest(i: Intro) {
    const r = await api<{ next: Match | null }>(`/api/intros/${i.id}/next-best`);
    setNextBest((m) => ({ ...m, [i.id]: r.next }));
  }

  const rows = intros?.filter((i) => inTab(i, tab)) ?? [];
  const latestReply = intros?.filter((i) => i.status === "replied" && i.repliedAt && Date.now() - new Date(i.repliedAt).getTime() < 7 * 86400_000)
    .sort((a, b) => new Date(b.repliedAt!).getTime() - new Date(a.repliedAt!).getTime())[0];
  const n = (t: Tab) => intros?.filter((i) => inTab(i, t)).length ?? 0;
  const canSuggest = (i: Intro) => (i.status === "not_interested" || i.status === "no_response") && !!i.goalId;

  const person = (i: Intro) => i.recipient ? (
    <button className="flex w-full min-w-0 items-center gap-3 text-left" onClick={() => setOpen(i.recipient!.id)}>
      <PersonAvatar first={i.recipient.firstName} last={i.recipient.lastName} size={32} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-medium hover:underline">
          <span className="truncate">{i.recipient.firstName} {i.recipient.lastName}</span>
          {i.unseen && i.status === "replied" && <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink">New</span>}
        </span>
        <span className="block truncate text-meta text-text-muted">{[i.recipient.jobTitle, i.recipient.employer].filter(Boolean).join(" · ") || "Georgia Tech"}</span>
      </span>
    </button>
  ) : <span className="text-text-muted">Removed from Venn</span>;

  // Click the message to read the whole thing (and the whole reply); click again to collapse.
  const message = (i: Intro) => {
    const isOpen = expanded.has(i.id);
    const toggleOpen = () => setExpanded((s) => { const n = new Set(s); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; });
    return (
      <div className="min-w-0 space-y-1.5">
        <button
          type="button" onClick={toggleOpen} aria-expanded={isOpen} aria-controls={`msg-${i.id}`}
          className="group block w-full min-w-0 rounded-sm text-left"
        >
          <p className={cn("font-medium", !isOpen && "truncate")}>{i.subject}</p>
          <p id={`msg-${i.id}`} className={cn("text-text-muted", isOpen ? "mt-1 whitespace-pre-wrap text-text" : "line-clamp-1")}>{i.message}</p>
          <span className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-link group-hover:underline">
            {isOpen ? <>Show less <ChevronUp className="size-3.5" aria-hidden /></> : <>Show full message <ChevronDown className="size-3.5" aria-hidden /></>}
          </span>
        </button>
        {i.replyPreview && (
          <p className={cn("rounded-md bg-success-soft px-3 py-2 text-body-sm text-text", isOpen ? "whitespace-pre-wrap" : "line-clamp-3")}>
            <span className="font-bold text-success">Their reply:</span> {i.replyPreview}
          </p>
        )}
      </div>
    );
  };

  const nextBestRow = (i: Intro) => {
    const nb = nextBest[i.id];
    if (!canSuggest(i)) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {nb === undefined && <Button size="sm" variant="ghost" onClick={() => suggest(i)}><Lightbulb /> Suggest the next best person</Button>}
        {nb === null && <span className="text-text-muted">No more matches for this goal. Try a new goal on Home.</span>}
        {nb && (
          <>
            <span><span className="font-medium">Next best:</span> {nb.profile.firstName} {nb.profile.lastName} <span className="text-text-muted">· {nb.reason}</span></span>
            <Button size="sm" variant="outline" onClick={() => setCompose({ p: nb.profile, goalId: i.goalId })}><Send /> Request intro</Button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title-1">Requests</h1>
          <p className="mt-1 text-text-muted">Every intro you&apos;ve sent, tracked automatically through the email relay.</p>
        </div>
      </header>
      {latestReply && latestReply.recipient && (
        <section className="on-brand flex flex-wrap items-center gap-4 rounded-lg bg-brand p-5 text-on-brand sm:p-6" aria-live="polite">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent"><Check className="size-6 stroke-[2.5] text-on-accent" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-title-2 font-extrabold">{latestReply.recipient.firstName} replied. You&apos;re connected!</p>
            <p className="text-on-brand-muted">We sent {latestReply.recipient.firstName}&apos;s reply to your email. Reply there to keep talking.</p>
          </div>
          <Button variant="brand" onClick={() => { setTab("all"); setTimeout(() => document.getElementById(`intro-${latestReply.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); }}>
            See {latestReply.recipient.firstName}&apos;s reply
          </Button>
        </section>
      )}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Segmented<Tab> label="Filter by status" value={tab} onChange={setTab}
          options={[
            { value: "all", label: `All ${n("all")}` }, { value: "sent", label: `Sent ${n("sent")}` }, { value: "replied", label: `Replied ${n("replied")}` },
            { value: "not_interested", label: `Not interested ${n("not_interested")}` }, { value: "no_response", label: `No response ${n("no_response")}` },
          ]} />
      </div>

      {err && <ErrorState message={err} onRetry={load} />}
      {!intros && !err && <LoadingRows n={4} label="Loading requests" />}
      {intros && rows.length === 0 && (
        <EmptyState title={tab === "all" ? "No intros yet" : "Nothing here"} icon={Send}
          action={tab === "all" ? <Button asChild><Link href="/home">Find someone</Link></Button> : undefined}>
          {tab === "all" ? "Type a goal on Home and your agent will find people and draft an intro." : "Intros with this status will show up here."}
        </EmptyState>
      )}

      {rows.length > 0 && (
        <>
          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-lg border bg-surface md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[30%] pl-4 text-[13px] text-text-muted">Person</TableHead>
                  <TableHead className="text-[13px] text-text-muted">Message</TableHead>
                  <TableHead className="w-[140px] text-[13px] text-text-muted">Status</TableHead>
                  <TableHead className="w-[110px] pr-4 text-right text-[13px] text-text-muted">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((i) => (
                  <Fragment key={i.id}>
                    <TableRow id={`intro-${i.id}`} data-intro-row className={cn("align-top", canSuggest(i) && "border-b-0")}>
                      <TableCell className="max-w-0 py-3.5 pl-4">{person(i)}</TableCell>
                      <TableCell className="max-w-0 whitespace-normal py-3.5">{message(i)}</TableCell>
                      <TableCell className="py-3.5"><StatusBadge status={i.status} /></TableCell>
                      <TableCell className="py-3.5 pr-4 text-right text-mono-sm text-text-subtle">{updatedAt(i)}</TableCell>
                    </TableRow>
                    {canSuggest(i) && (
                      <TableRow data-intro-row className="hover:bg-transparent">
                        <TableCell colSpan={4} className="pb-3 pl-[60px] pt-0">{nextBestRow(i)}</TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Phones: stacked rows */}
          <ul className="divide-y rounded-lg border bg-surface md:hidden">
            {rows.map((i) => (
              <li key={i.id} id={`intro-m-${i.id}`} data-intro-row className="space-y-2.5 px-4 py-4">
                <div className="flex items-start justify-between gap-2">{person(i)}<StatusBadge status={i.status} /></div>
                {message(i)}
                <p className="text-mono-sm text-text-subtle">Updated {updatedAt(i).toLowerCase()}</p>
                {nextBestRow(i)}
              </li>
            ))}
          </ul>
        </>
      )}

      {intros && intros.length > 0 && (
        <p className="flex items-start gap-2 rounded-md bg-primary-soft px-4 py-3 text-body-sm text-primary-ink">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> Venn sends one reminder after 5 days. Requests close as &ldquo;No response&rdquo; 10 days after sending if there&apos;s no reply.
        </p>
      )}

      <ProfileSheet id={open} onClose={() => setOpen(null)} onRequest={(p) => { setOpen(null); setCompose({ p, goalId: null }); }} />
      <IntroComposer recipient={compose?.p ?? null} goalId={compose?.goalId} onClose={() => setCompose(null)} onSent={load} />
    </div>
  );
}
