"use client";
import { Check, Loader2, Sparkles } from "lucide-react";

export type Step = { id: string; label: string; status: "running" | "done" };
const ORDER = ["parse", "search", "rank", "ready"];

/**
 * One-line agent status. While running: current step + "2 of 4" + thin progress line.
 * When done: collapses into "Venn understood: [chips]".
 */
export function AgentStatus({ steps, running, understood }: { steps: Step[]; running: boolean; understood?: string[] }) {
  const done = steps.filter((s) => s.status === "done").length;
  const current = steps.find((s) => s.status === "running") ?? steps[steps.length - 1];

  if (!running && understood) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border bg-surface px-4 py-2.5" aria-live="polite">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
          <span className="grid size-4 place-items-center rounded-full bg-success-bg"><Check className="size-3 text-success" aria-hidden /></span>
          Venn understood:
        </span>
        {understood.length === 0 && <span className="text-meta text-ink-2">a general search across the network</span>}
        {understood.map((c) => <span key={c} className="rounded-full bg-muted px-2.5 py-0.5 text-[13px]">{c}</span>)}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border bg-surface px-4 py-2.5" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-[14px]">
        {running ? <Loader2 className="size-4 animate-spin text-brand" aria-hidden /> : <Sparkles className="size-4 text-petal-text" aria-hidden />}
        <span className="font-medium">{current ? `${current.label}${running ? "…" : ""}` : "Starting…"}</span>
        <span className="ml-auto text-meta tabular-nums text-ink-2">{Math.min(done + (running ? 1 : 0), ORDER.length)} of {ORDER.length}</span>
      </div>
      {running && (
        <span className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-muted" aria-hidden>
          <span className="venn-progress block h-full w-1/3 bg-brand" />
        </span>
      )}
    </div>
  );
}
