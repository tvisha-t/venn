"use client";
import { useEffect, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingCards } from "@/components/states";
import { api } from "@/lib/api";

type Counts = Record<string, number>;
type Row = { label: string; sent: number; replied: number };
type Dash = {
  profiles: { claimed: number; unclaimed: number; removed: number };
  intros: { total: number; sent: number; replied: number; not_interested: number; no_response: number; undeliverable: number };
  replyRate: number; byIndustry: Row[]; byCity: Row[]; imports: { at: string; counts: Counts }[]; auditCounts: { action: string; n: number }[];
};

const COUNT_LABELS: Record<string, string> = {
  rows: "Rows in file", imported: "Imported (unclaimed profiles)", created: "· created", updated: "· updated",
  excluded_deceased: "Excluded: deceased", excluded_opt_out: "Excluded: directory opt-out", excluded_not_alum: "Excluded: not yet graduated",
  suppressed: "Suppressed (removed / opted out of Venn)", deduped: "Duplicate records merged", merged_with_claimed: "Merged with claimed members",
  do_not_contact: "Do-not-contact (listed, no intros)", purged_previously_imported: "Purged (opted out since last import)",
};

export default function Admin() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Counts | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);

  function load() { setErr(null); api<Dash>("/api/admin/dashboard").then(setDash).catch((e) => setErr(e.message)); }
  useEffect(load, []);

  async function upload() {
    if (!file) return;
    setBusy(true); setImportErr(null); setResult(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/admin/import-aa", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data.counts); load();
    } catch (e) { setImportErr((e as Error).message); }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-3xl font-semibold">Admin <span className="text-base font-sans font-normal text-gray-matter">(demo)</span></h1>
        <p className="text-gray-matter">Alumni Association import and engagement. Aggregates only: no names, no contact data.</p>
      </header>

      <section className="space-y-3 rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Alumni Association import</h2>
        <p className="text-sm text-gray-matter">Upload the AA export CSV. Deceased and directory-opt-out rows are never stored, duplicates are merged, claimed members win, and people who removed themselves are never re-created. Safe to re-run.</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-md border bg-white px-3 py-2 text-sm hover:border-petal">
            {file ? file.name : "Choose CSV…"}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Button onClick={upload} disabled={!file || busy}>{busy ? <Loader2 className="animate-spin" /> : <Upload />} Run import</Button>
        </div>
        {importErr && <ErrorState message={importErr} />}
        {result && <CountsTable counts={result} />}
      </section>

      {err && <ErrorState message={err} onRetry={load} />}
      {!dash && !err && <LoadingCards n={3} />}
      {dash && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Claimed profiles" value={dash.profiles.claimed} />
            <Stat label="Unclaimed (AA)" value={dash.profiles.unclaimed} />
            <Stat label="Intros sent" value={dash.intros.total} />
            <Stat label="Reply rate" value={`${dash.replyRate}%`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown title="Intros by recipient industry" rows={dash.byIndustry} />
            <Breakdown title="Intros by recipient city" rows={dash.byCity} />
          </div>
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-5">
              <h2 className="mb-2 font-semibold">Last import</h2>
              {dash.imports[0] ? <><p className="mb-2 text-xs text-gray-matter">{new Date(dash.imports[0].at).toLocaleString()}</p><CountsTable counts={dash.imports[0].counts} /></> : <p className="text-sm text-gray-matter">No imports yet.</p>}
            </div>
            <div className="rounded-xl border bg-white p-5">
              <h2 className="mb-2 font-semibold">Audit log (event counts)</h2>
              <table className="w-full text-sm"><tbody>
                {dash.auditCounts.map((a) => <tr key={a.action} className="border-t"><td className="py-1.5 font-mono text-xs">{a.action}</td><td className="text-right">{a.n}</td></tr>)}
              </tbody></table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-xl border bg-white p-4"><p className="text-sm text-gray-matter">{label}</p><p className="font-serif text-3xl font-semibold">{value}</p></div>;
}

function CountsTable({ counts }: { counts: Counts }) {
  return (
    <table className="w-full max-w-md text-sm">
      <caption className="sr-only">Import summary</caption>
      <tbody>
        {Object.entries(COUNT_LABELS).filter(([k]) => k in counts).map(([k, label]) => (
          <tr key={k} className="border-t"><th scope="row" className="py-1.5 text-left font-normal">{label}</th><td className="text-right font-semibold tabular-nums">{counts[k]}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Row[] }) {
  const max = Math.max(1, ...rows.map((r) => r.sent));
  return (
    <section className="rounded-xl border bg-white p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {rows.length === 0 && <p className="text-sm text-gray-matter">No intros yet.</p>}
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="text-sm">
            <div className="flex justify-between"><span>{r.label}</span><span className="tabular-nums text-gray-matter">{r.replied}/{r.sent} replied</span></div>
            <div className="mt-1 h-2 rounded-full bg-muted" aria-hidden>
              <div className="relative h-2 rounded-full bg-pi-mile" style={{ width: `${(100 * r.sent) / max}%` }}>
                <div className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${r.sent ? (100 * r.replied) / r.sent : 0}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-gray-matter"><span className="inline-block size-2 rounded-full bg-brand" /> replied · <span className="inline-block size-2 rounded-full bg-pi-mile" /> sent</p>
    </section>
  );
}
