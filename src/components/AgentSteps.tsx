"use client";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type Step = { id: string; label: string; status: "running" | "done" };
const ORDER = ["parse", "search", "rank", "ready"] as const;
const DEFAULT_LABEL: Record<(typeof ORDER)[number], string> = {
  parse: "Understand your goal",
  search: "Search Venn members",
  rank: "Rank by what you share",
  ready: "Ready",
};

function Dot({ state }: { state: "done" | "running" | "waiting" }) {
  if (state === "done") {
    return <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary"><Check className="size-3 stroke-[3] text-on-primary" aria-hidden /></span>;
  }
  if (state === "running") {
    return <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />;
  }
  return <span className="size-5 shrink-0 rounded-full border-2 border-line-control" aria-hidden />;
}

/** "Venn's search": plain-language steps with status dots; the first step shows what Venn understood. */
export function AgentStatus({ steps, running, understood, elapsedMs }: { steps: Step[]; running: boolean; understood?: string[]; elapsedMs?: number | null }) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const onlyUnderstood = steps.length === 0 && !running;

  const rows = onlyUnderstood ? (["parse"] as const) : ORDER;
  return (
    <section className="rounded-lg border border-line bg-surface p-5 shadow-card" aria-live="polite" aria-label="Venn's search">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-eyebrow text-accent-text">Venn&apos;s search</p>
        {elapsedMs != null && <p className="text-mono-sm text-text-subtle">{(elapsedMs / 1000).toFixed(1)}s</p>}
      </div>
      <ol className="space-y-2.5">
        {rows.map((id) => {
          const s = byId.get(id);
          const state = onlyUnderstood ? "done" : s?.status === "done" ? "done" : s ? "running" : "waiting";
          const showUnderstood = id === "parse" && state === "done" && understood;
          return (
            <li key={id} className={cn("flex items-start gap-2.5 text-body-sm", state === "waiting" ? "text-text-subtle" : "text-text")}>
              <Dot state={state} />
              <span className="pt-px">
                {showUnderstood ? (
                  <>Understood your goal{understood!.length ? ": " : ""}<strong className="font-bold">{understood!.join(" · ")}</strong></>
                ) : (
                  s?.label.replace(/(\d[\d,]*)/, "⁠$1") ?? DEFAULT_LABEL[id]
                )}
              </span>
              <span className="sr-only">{state === "done" ? "complete" : state === "running" ? "in progress" : "waiting"}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
