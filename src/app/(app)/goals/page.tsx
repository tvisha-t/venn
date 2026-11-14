"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { api } from "@/lib/api";

type Goal = { id: string; rawText: string; standing: boolean; createdAt: string; matches: number; newMatches: number };

export default function SavedGoals() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => { setErr(null); api<{ goals: Goal[] }>("/api/goals").then((r) => setGoals(r.goals)).catch((e) => setErr(e.message)); };
  useEffect(load, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-title">Saved goals</h1>
        <p className="mt-1 text-text-muted">Goals you&apos;ve asked Venn about. Active goals re-run when new people join and flag new matches.</p>
      </header>
      {err && <ErrorState message={err} onRetry={load} />}
      {!goals && !err && (
        <div className="divide-y rounded-lg border bg-surface" role="status" aria-label="Loading goals">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="flex items-center gap-3 p-4"><Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-16" /></div>)}
        </div>
      )}
      {goals?.length === 0 && (
        <EmptyState title="No goals yet" action={<Button asChild><Link href="/home">Ask Venn</Link></Button>}>Type what you need on Home and your agent will find people.</EmptyState>
      )}
      {goals && goals.length > 0 && (
        <ul className="divide-y rounded-lg border bg-surface">
          {goals.map((g) => (
            <li key={g.id}>
              <Link href={`/goals/${g.id}`} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium">{g.rawText}</p>
                  <p className="text-meta text-text-muted">{g.matches} matches · {new Date(g.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                </div>
                {g.newMatches > 0 && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent-ink">{g.newMatches} new</span>}
                {g.standing ? (
                  <span className="rounded-full bg-success-soft px-2 py-0.5 text-[12px] font-medium text-success">Active</span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium text-text-muted">Paused</span>
                )}
                <ChevronRight className="size-4 text-text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
