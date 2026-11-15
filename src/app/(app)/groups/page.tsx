"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Info, Search } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { VennMark } from "@/components/brand/VennMark";
import type { GroupItem } from "@/server/groups";
import { CATEGORY_LABEL, GroupCard, GroupIcon } from "@/components/groups/GroupBits";

type Data = { groups: GroupItem[]; suggested: { group: GroupItem; why: string }[] };
const CHIPS = [{ key: "all", label: "All" }, ...Object.entries(CATEGORY_LABEL).map(([key, label]) => ({ key, label }))];

export default function GroupsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => { setErr(null); api<Data>("/api/groups").then(setData).catch((e) => setErr((e as Error).message)); }, []);
  useEffect(load, [load]);

  async function join(g: GroupItem) {
    setBusy(g.id);
    try {
      await api(`/api/groups/${g.slug}/membership`, { method: "POST" });
      setData((d) => d && { ...d, groups: d.groups.map((x) => (x.id === g.id ? { ...x, joined: true, count: x.count + 1 } : x)), suggested: d.suggested.filter((s) => s.group.id !== g.id) });
      toast(g.sensitive ? "Joined privately. Only other members can see you." : `Joined ${g.name}.`);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  }

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.groups ?? []).filter((g) => (cat === "all" || g.category === cat) && (!t || `${g.name} ${g.description}`.toLowerCase().includes(t)));
  }, [data, q, cat]);
  const sug = data?.suggested[0];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[34px] tracking-[-0.03em] md:text-[30px] md:leading-9">Affinity groups</h1>
          <p className="mt-1 text-text-muted">Georgia Tech affinity groups. Find your people all over again.</p>
        </div>
        <label className="relative w-full sm:w-[340px]">
          <span className="sr-only">Search groups</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups"
            className="h-11 w-full rounded-full border border-line-control bg-surface pl-10 pr-4 text-[15px] text-text outline-none focus:border-primary" />
        </label>
      </header>

      {sug && (
        <section aria-labelledby="sug-h" className="on-brand relative flex flex-col gap-4 overflow-hidden rounded-xl bg-brand p-6 text-on-brand md:flex-row md:items-center md:justify-between">
          <VennMark size={240} stroke="var(--on-brand)" overlap="var(--on-brand)" className="pointer-events-none absolute -right-8 -top-12 opacity-[0.07]" />
          <div className="relative flex items-center gap-4">
            <GroupIcon icon={sug.group.icon} dark />
            <div className="min-w-0">
              <p className="text-eyebrow text-accent">Suggested for you</p>
              <h2 id="sug-h" className="mt-1 text-title-2 font-extrabold">
                <Link href={`/groups/${sug.group.slug}`} className="hover:underline underline-offset-4">{sug.group.name}</Link>
              </h2>
              <p className="mt-1 text-body-sm text-on-brand-muted">{sug.why} Only you can see why it&apos;s suggested.</p>
            </div>
          </div>
          <button type="button" disabled={busy === sug.group.id} onClick={() => join(sug.group)}
            className="relative inline-flex h-12 shrink-0 items-center justify-center rounded-md bg-accent px-6 font-bold text-on-accent hover:bg-accent-hover disabled:opacity-60 md:min-w-[180px]">
            {sug.group.sensitive ? "Join privately" : "Join"}
          </button>
        </section>
      )}

      <div role="radiogroup" aria-label="Category" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        {CHIPS.map((c) => (
          <button key={c.key} type="button" role="radio" aria-checked={cat === c.key} onClick={() => setCat(c.key)}
            className={cn("inline-flex h-10 shrink-0 items-center rounded-full px-4 text-body-sm font-semibold transition-colors",
              cat === c.key ? "bg-primary text-on-primary" : "border border-line bg-surface text-text hover:bg-surface-raised")}>
            {c.label}
          </button>
        ))}
      </div>

      {err && <ErrorState message={err} onRetry={load} />}
      {!data && !err && <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-lg" />)}</div>}
      {data && shown.length === 0 && (
        <div className="rounded-lg border border-line bg-surface p-6 text-center shadow-card"><p className="text-title-3">No groups match “{q}”.</p></div>
      )}
      {data && shown.length > 0 && (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3" aria-label="Groups">
          {shown.map((g) => <GroupCard key={g.id} g={g} busy={busy === g.id} onJoin={join} />)}
        </ul>
      )}

      <p className="flex items-start gap-2 rounded-md bg-primary-soft px-4 py-3 text-body-sm text-primary-ink">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> Groups marked private never appear on your profile or in &ldquo;You both&rdquo; matches unless you turn it on.
      </p>
    </div>
  );
}
