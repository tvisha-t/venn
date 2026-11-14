"use client";
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { Lightbulb, Send } from "lucide-react";
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

const BADGE: Record<IntroStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-muted text-ink-2" },
  sent: { label: "Sent", cls: "bg-brand-tint text-brand" },
  replied: { label: "Replied", cls: "bg-success-bg text-success" },
  not_interested: { label: "Not interested", cls: "bg-muted text-ink-2" },
  no_response: { label: "No response", cls: "bg-warn-bg text-warn" },
  bounced: { label: "Couldn't deliver", cls: "bg-danger-bg text-danger" },
  suppressed: { label: "No email on file", cls: "bg-muted text-ink-2" },
};

function StatusBadge({ status }: { status: IntroStatus }) {
  const b = BADGE[status];
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium", b.cls)}>{b.label}</span>;
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

  function load() {
    setErr(null);
    api<{ intros: Intro[] }>("/api/intros").then((r) => {
      setIntros(r.intros);
      if (r.intros.some((i) => i.unseen)) api("/api/intros/seen", { method: "POST" }).then(refresh).catch(() => {});
    }).catch((e) => setErr(e.message));
  }
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function suggest(i: Intro) {
    const r = await api<{ next: Match | null }>(`/api/intros/${i.id}/next-best`);
    setNextBest((m) => ({ ...m, [i.id]: r.next }));
  }

  const rows = intros?.filter((i) => inTab(i, tab)) ?? [];
  const n = (t: Tab) => intros?.filter((i) => inTab(i, t)).length ?? 0;
  const canSuggest = (i: Intro) => (i.status === "not_interested" || i.status === "no_response") && !!i.goalId;

  const person = (i: Intro) => i.recipient ? (
    <button className="flex w-full min-w-0 items-center gap-3 text-left" onClick={() => setOpen(i.recipient!.id)}>
      <PersonAvatar first={i.recipient.firstName} last={i.recipient.lastName} size={32} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 font-medium hover:underline">
          <span className="truncate">{i.recipient.firstName} {i.recipient.lastName}</span>
          {i.unseen && i.status === "replied" && <span className="rounded-full bg-petal-tint px-1.5 py-0.5 text-[11px] font-semibold text-petal-text">New</span>}
        </span>
        <span className="block truncate text-meta text-ink-2">{[i.recipient.jobTitle, i.recipient.employer].filter(Boolean).join(" · ") || "Georgia Tech"}</span>
      </span>
    </button>
  ) : <span className="text-ink-2">Removed from Venn</span>;

  const message = (i: Intro) => (
    <div className="min-w-0 space-y-1.5">
      <p className="truncate font-medium">{i.subject}</p>
      <p className="line-clamp-1 text-ink-2">{i.message}</p>
      {i.replyPreview && (
        <p className="line-clamp-2 rounded-md bg-success-bg/60 px-2.5 py-1.5 text-[13px]">
          <span className="font-medium text-success">Reply:</span> {i.replyPreview}
        </p>
      )}
    </div>
  );

  const nextBestRow = (i: Intro) => {
    const nb = nextBest[i.id];
    if (!canSuggest(i)) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        {nb === undefined && <Button size="sm" variant="ghost" onClick={() => suggest(i)}><Lightbulb /> Suggest the next best person</Button>}
        {nb === null && <span className="text-ink-2">No more matches for this goal. Try a new goal on Home.</span>}
        {nb && (
          <>
            <span><span className="font-medium">Next best:</span> {nb.profile.firstName} {nb.profile.lastName} <span className="text-ink-2">· {nb.reason}</span></span>
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
          <h1 className="text-title">Requests</h1>
          <p className="mt-1 text-ink-2">Every intro you&apos;ve sent, tracked automatically through the email relay.</p>
        </div>
      </header>
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
                  <TableHead className="w-[30%] pl-4 text-[13px] text-ink-2">Person</TableHead>
                  <TableHead className="text-[13px] text-ink-2">Message</TableHead>
                  <TableHead className="w-[140px] text-[13px] text-ink-2">Status</TableHead>
                  <TableHead className="w-[110px] pr-4 text-right text-[13px] text-ink-2">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((i) => (
                  <Fragment key={i.id}>
                    <TableRow data-intro-row className={cn("align-top", canSuggest(i) && "border-b-0")}>
                      <TableCell className="max-w-0 py-3.5 pl-4">{person(i)}</TableCell>
                      <TableCell className="max-w-0 whitespace-normal py-3.5">{message(i)}</TableCell>
                      <TableCell className="py-3.5"><StatusBadge status={i.status} /></TableCell>
                      <TableCell className="py-3.5 pr-4 text-right text-meta text-ink-2">{updatedAt(i)}</TableCell>
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
              <li key={i.id} data-intro-row className="space-y-2.5 px-4 py-3.5">
                <div className="flex items-start justify-between gap-2">{person(i)}<StatusBadge status={i.status} /></div>
                {message(i)}
                <p className="text-meta text-ink-2">Updated {updatedAt(i).toLowerCase()}</p>
                {nextBestRow(i)}
              </li>
            ))}
          </ul>
        </>
      )}

      <ProfileSheet id={open} onClose={() => setOpen(null)} onRequest={(p) => { setOpen(null); setCompose({ p, goalId: null }); }} />
      <IntroComposer recipient={compose?.p ?? null} goalId={compose?.goalId} onClose={() => setCompose(null)} onSent={load} />
    </div>
  );
}
