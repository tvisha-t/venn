"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, RefreshCw } from "lucide-react";
import { Switch } from "@/components/Switch";
import { Button } from "@/components/ui/button";
import { MatchResults } from "@/components/MatchResults";
import { AgentStatus } from "@/components/AgentSteps";
import { ErrorState, LoadingRows } from "@/components/states";
import { api, type Match } from "@/lib/api";

type Resp = { goal: { id: string; rawText: string; explanation: string; understood: string[]; standing: boolean; relaxed: string[] }; matches: Match[] };

export default function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setErr(null);
    api<Resp>(`/api/goals/${id}/matches`).then((r) => {
      setData(r);
      if (r.matches.some((m) => m.isNew)) api(`/api/goals/${id}/seen`, { method: "POST" }).catch(() => {});
    }).catch((e) => setErr(e.message));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(standing: boolean) {
    await api(`/api/goals/${id}`, { method: "PATCH", json: { standing } });
    setData((d) => d && { ...d, goal: { ...d.goal, standing } });
    toast.success(standing ? "Venn will keep looking and flag new matches." : "Goal paused.");
  }
  async function rerun() {
    setBusy(true);
    try {
      const r = await api<{ added: number }>(`/api/goals/${id}`, { method: "POST" });
      toast.success(r.added ? `${r.added} new matches` : "No new matches yet.");
      load();
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  if (err) return <ErrorState message={err} onRetry={load} />;
  if (!data) return <LoadingRows label="Loading goal" />;
  const newCount = data.matches.filter((m) => m.isNew).length;
  return (
    <div className="space-y-5">
      <Link href="/goals" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink"><ChevronLeft className="size-4" aria-hidden /> Saved goals</Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-title">{data.goal.rawText}</h1>
          <p className="mt-1 text-ink-2">{data.goal.explanation}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-surface px-4 py-2.5">
          <Switch id="standing" checked={data.goal.standing} onChange={toggle} label="Keep this goal active" />
          {data.goal.standing && <Button size="sm" variant="ghost" onClick={rerun} disabled={busy}><RefreshCw className={busy ? "animate-spin" : ""} /> Check now</Button>}
        </div>
      </header>
      <AgentStatus steps={[]} running={false} understood={data.goal.understood} />
      {newCount > 0 && <p className="rounded-lg bg-petal-tint px-4 py-2.5 text-petal-text"><strong className="font-semibold">{newCount} new {newCount === 1 ? "match" : "matches"}</strong> since you last looked.</p>}
      {data.goal.relaxed.length > 0 && <p className="rounded-lg bg-warn-bg px-4 py-2.5 text-warn">No exact matches. We loosened the <strong className="font-medium">{data.goal.relaxed.join(", then ")}</strong> filter.</p>}
      <MatchResults matches={data.matches} goalId={id} onChanged={load} />
    </div>
  );
}
