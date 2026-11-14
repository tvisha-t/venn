"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, FileUp, Loader2, ShieldCheck } from "lucide-react";
import { LinkedInButton, LinkedInMark } from "@/components/LinkedInButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "@/components/AppShell";
import { api, ROLE_LABEL, type OwnProfile, type SharedContact } from "@/lib/api";

type Vocab = { industries: string[]; majors: string[]; programs: string[]; csThreads: string[]; openTo: string[]; cities: { city: string; state: string }[] };
type Form = {
  firstName: string; lastName: string; roles: string[]; classYear: string; degree: string; major: string; industry: string;
  employer: string; jobTitle: string; city: string; state: string; gtPrograms: string[]; csThreads: string[];
  activities: string; summary: string; openTo: string[]; interests: string;
};

const fromProfile = (p: OwnProfile): Form => ({
  firstName: p.firstName, lastName: p.lastName === "-" ? "" : p.lastName, roles: p.roles, classYear: p.classYear ? String(p.classYear) : "",
  degree: p.degree ?? "", major: p.major ?? "", industry: p.industry ?? "", employer: p.employer ?? "", jobTitle: p.jobTitle ?? "",
  city: p.city ?? "", state: p.state ?? "", gtPrograms: p.gtPrograms, csThreads: p.csThreads, activities: p.activities.join(", "),
  summary: p.summary ?? "", openTo: p.openTo, interests: p.interests.join(", "),
});
const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function ProfileInner() {
  const { me, refresh } = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const fromClaim = params.get("import") === "linkedin";
  const welcome = params.get("welcome") === "1"; // joined from an invite link or LinkedIn
  const [vocab, setVocab] = useState<Vocab | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [mode, setMode] = useState<"import" | "edit">("edit");
  const [paste, setPaste] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractErr, setExtractErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  useEffect(() => { api<Vocab>("/api/vocab").then(setVocab).catch(() => {}); }, []);
  useEffect(() => {
    if (me && !form) {
      setForm(fromProfile(me.profile));
      if (fromClaim || welcome || (!me.profile.summaryApproved && !me.profile.employer && !me.profile.major)) setMode("import");
    }
  }, [me, form]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggle = (k: "roles" | "gtPrograms" | "csThreads" | "openTo", v: string) =>
    setForm((f) => (f ? { ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] } : f));

  async function extract() {
    setExtracting(true); setExtractErr(null);
    try {
      const fd = new FormData();
      if (file) fd.append("file", file); else fd.append("text", paste);
      const res = await fetch("/api/profile/import-resume", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't read that.");
      const x = data.extracted;
      setForm((f) => f && {
        ...f,
        roles: x.roles.length ? x.roles : f.roles, classYear: x.classYear ? String(x.classYear) : f.classYear, degree: x.degree ?? f.degree,
        major: x.major ?? f.major, industry: x.industry ?? f.industry, employer: x.employer ?? f.employer, jobTitle: x.jobTitle ?? f.jobTitle,
        city: x.city ?? f.city, state: x.state ?? f.state, gtPrograms: x.gtPrograms, csThreads: x.csThreads,
        activities: x.activities.join(", "), summary: x.summary, openTo: x.openTo, interests: x.interests.join(", "),
      });
      setAiNote(x.source === "linkedin_export" ? "Filled in from your LinkedIn data export. Check every field." : x.source === "llm" ? "Filled in by AI from your document. Check every field." : "Filled in with basic text matching (AI unavailable). Please review carefully.");
      setMode("edit");
    } catch (e) { setExtractErr((e as Error).message); }
    setExtracting(false);
  }

  async function approve() {
    if (!form) return;
    setSaving(true);
    try {
      await api("/api/profile/approve", {
        method: "POST",
        json: {
          firstName: form.firstName, lastName: form.lastName, roles: form.roles, classYear: form.classYear ? Number(form.classYear) : null,
          degree: form.degree || null, major: form.major || null, industry: form.industry || null, employer: form.employer || null,
          jobTitle: form.jobTitle || null, city: form.city || null, state: form.state || null, gtPrograms: form.gtPrograms,
          csThreads: form.csThreads, activities: csv(form.activities), summary: form.summary, openTo: form.openTo, interests: csv(form.interests),
        },
      });
      const first = !me?.profile.summaryApproved;
      toast.success(first ? "Profile approved — you're live on Venn." : "Profile updated.");
      refresh();
      if (first) router.push("/home");
    } catch (e) { toast.error((e as Error).message); }
    setSaving(false);
  }

  if (!me || !form) return <div className="space-y-3"><Skeleton className="h-10 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  const approved = me.profile.summaryApproved;
  const valid = form.firstName && form.lastName && form.roles.length && form.summary.trim().length >= 10;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">{approved ? "Your profile" : "Build your profile"}</h1>
        <p className="text-text-muted">
          {approved ? "This is what other GT members see. Contact details stay private unless you choose to share them below."
            : "Upload a LinkedIn “Save to PDF” or your resume. AI extracts your profile, and nothing goes public until you approve it."}
        </p>
      </header>

      <LinkedInConnect />

      {mode === "import" ? (
        <section className="space-y-4 rounded-lg border bg-surface p-5">
          {fromClaim && (
            <div className="rounded-lg bg-primary-soft px-4 py-3">
              <p className="font-semibold">Welcome! Your Alumni Association record is prefilled.</p>
              <p className="text-text-muted">Import from LinkedIn to bring it up to date in 30 seconds, or skip and edit it yourself. Nothing goes public until you approve.</p>
            </div>
          )}
          {welcome && !fromClaim && (
            <div className="rounded-lg bg-primary-soft px-4 py-3 text-primary-ink">
              <p className="font-semibold">Welcome to Venn, {me.profile.firstName}!</p>
              <p className="text-body-sm">Fill your profile in 30 seconds: on LinkedIn, open your profile → <em>More</em> → <em>Save to PDF</em>, then upload it below. You review everything before it goes live.</p>
            </div>
          )}
          <h2 className="text-[15px] font-semibold">1 · Import from LinkedIn or a resume</h2>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors hover:border-primary/40 hover:bg-muted/40">
            <FileUp className="size-7 text-text-subtle" aria-hidden />
            <span className="font-medium">{file ? file.name : "Choose a LinkedIn data export (.zip), LinkedIn PDF, or resume PDF"}</span>
            <span className="text-meta text-text-muted">From a LinkedIn export we read only your profile, positions, education and skills, never your connections or messages. Emails, phone numbers and links are stripped.</span>
            <input type="file" accept="application/pdf,.pdf,application/zip,.zip" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <details className="rounded-lg bg-muted/50 px-4 py-3 text-[14px]">
            <summary className="cursor-pointer font-medium">How do I get my LinkedIn data?</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-text-muted">
              <li><strong className="font-medium text-text">Quickest (PDF):</strong> open your LinkedIn profile → <em>More</em> → <em>Save to PDF</em>.</li>
              <li><strong className="font-medium text-text">Most complete (.zip):</strong> LinkedIn → <em>Settings &amp; Privacy</em> → <em>Data privacy</em> → <em>Get a copy of your data</em>. Pick &ldquo;Profile&rdquo;, &ldquo;Positions&rdquo;, &ldquo;Education&rdquo; and &ldquo;Skills&rdquo; (or the full archive) and upload the .zip LinkedIn emails you.</li>
            </ol>
          </details>
          <div className="space-y-1.5">
            <Label htmlFor="paste">…or paste the text</Label>
            <Textarea id="paste" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste your LinkedIn About + Experience, or resume text" />
          </div>
          {extractErr && <ErrorState message={extractErr} />}
          <div className="flex flex-wrap gap-2">
            <Button onClick={extract} disabled={extracting || (!file && paste.trim().length < 40)}>{extracting && <Loader2 className="animate-spin" />} {extracting ? "Reading your file…" : "Extract my profile"}</Button>
            <Button variant="ghost" onClick={() => setMode("edit")}>Skip — fill it in myself</Button>
          </div>
        </section>
      ) : (
        <section className="space-y-5 rounded-lg border border-line bg-surface p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{approved ? "Edit" : "2 · Review and edit"}</h2>
            <Button variant="outline" size="sm" onClick={() => setMode("import")}><FileUp /> Import from LinkedIn</Button>
          </div>
          {aiNote && <p className="rounded-lg bg-canvas px-3 py-2 text-sm">{aiNote}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="fn" label="First name"><Input id="fn" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
            <Field id="ln" label="Last name"><Input id="ln" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">I am a… (choose all that apply)</legend>
            <div className="flex flex-wrap gap-3">
              {Object.entries(ROLE_LABEL).map(([k, v]) => (
                <label key={k} className="flex items-center gap-1.5 text-sm"><Checkbox checked={form.roles.includes(k)} onCheckedChange={() => toggle("roles", k)} />{v}</label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="cy" label="Class year"><Input id="cy" inputMode="numeric" value={form.classYear} onChange={(e) => set("classYear", e.target.value.replace(/\D/g, "").slice(0, 4))} /></Field>
            <Field id="deg" label="Degree"><Input id="deg" value={form.degree} onChange={(e) => set("degree", e.target.value)} placeholder="BS, MS, PhD…" /></Field>
            <Field id="maj" label="Major"><Input id="maj" list="majors" value={form.major} onChange={(e) => set("major", e.target.value)} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="jt" label="Job title"><Input id="jt" value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} /></Field>
            <Field id="emp" label="Employer"><Input id="emp" value={form.employer} onChange={(e) => set("employer", e.target.value)} /></Field>
            <Field id="ind" label="Industry"><Input id="ind" list="industries" value={form.industry} onChange={(e) => set("industry", e.target.value)} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="city" label="City"><Input id="city" list="cities" value={form.city} onChange={(e) => { set("city", e.target.value); const c = vocab?.cities.find((x) => x.city === e.target.value); if (c) set("state", c.state); }} /></Field>
            <Field id="st" label="State"><Input id="st" value={form.state} onChange={(e) => set("state", e.target.value)} /></Field>
          </div>
          <p className="-mt-2 text-xs text-text-muted">Your location is shown as a city and rounded to about 1 km on the map.</p>
          <ChipSet legend="GT programs" options={vocab?.programs ?? []} value={form.gtPrograms} onToggle={(v) => toggle("gtPrograms", v)} />
          {(form.major.toLowerCase().includes("computer") || form.csThreads.length > 0) && <ChipSet legend="CS threads" options={vocab?.csThreads ?? []} value={form.csThreads} onToggle={(v) => toggle("csThreads", v)} />}
          <ChipSet legend="Open to" options={vocab?.openTo ?? []} value={form.openTo} onToggle={(v) => toggle("openTo", v)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="act" label="Activities (comma-separated)"><Input id="act" value={form.activities} onChange={(e) => set("activities", e.target.value)} /></Field>
            <Field id="int" label="Interests (comma-separated)"><Input id="int" value={form.interests} onChange={(e) => set("interests", e.target.value)} /></Field>
          </div>
          <Field id="sum" label="Summary (shown on your profile)">
            <Textarea id="sum" rows={3} maxLength={600} value={form.summary} onChange={(e) => set("summary", e.target.value)} />
          </Field>

          <datalist id="majors">{vocab?.majors.map((m) => <option key={m} value={m} />)}</datalist>
          <datalist id="industries">{vocab?.industries.map((m) => <option key={m} value={m} />)}</datalist>
          <datalist id="cities">{vocab?.cities.map((c) => <option key={`${c.city}${c.state}`} value={c.city}>{c.state}</option>)}</datalist>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="flex items-center gap-1.5 text-xs text-text-muted"><ShieldCheck className="size-4" aria-hidden /> Your login email is never shown. Students appear only after approving.</p>
            <Button onClick={approve} disabled={saving || !valid}>{saving && <Loader2 className="animate-spin" />}{approved ? "Save changes" : "Approve & publish"}</Button>
          </div>
        </section>
      )}

      {approved && <ContactSharing />}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function ChipSet({ legend, options, value, onToggle }: { legend: string; options: string[]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button type="button" key={o} aria-pressed={value.includes(o)} onClick={() => onToggle(o)}
            className={`rounded-full border px-2.5 py-1 text-xs ${value.includes(o) ? "border-primary bg-primary text-on-primary" : "bg-surface hover:border-line-control"}`}>{o}</button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * LinkedIn, after GT verification: "Connect LinkedIn" proves the member owns a LinkedIn account
 * (LinkedIn's sign-in shares only name + email, never the profile link, jobs or education), then the
 * member adds their profile link, which signed-in GT members see as a "LinkedIn" button on their profile.
 */
function LinkedInConnect() {
  const params = useSearchParams();
  const result = params.get("linkedin"); // connected | taken | cancelled | error
  const [st, setSt] = useState<{ ready: boolean; connected: boolean } | null>(null);
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<{ ready: boolean; connected: boolean }>("/api/auth/linkedin/status").then(setSt).catch(() => setSt({ ready: false, connected: false }));
    api<{ contact: SharedContact }>("/api/me/contact").then((r) => { setSaved(r.contact.linkedinUrl); setUrl(r.contact.linkedinUrl ?? ""); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (result === "connected") toast.success("LinkedIn connected. Add your profile link so members can open it.");
    if (result === "taken") toast.error("That LinkedIn account is already connected to another Venn member.");
    if (result === "error") toast.error("LinkedIn didn't finish connecting. Try again.");
  }, [result]);

  if (!st || (!st.ready && !st.connected)) return null;

  async function saveUrl(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const cur = (await api<{ contact: SharedContact }>("/api/me/contact")).contact;
      const r = await api<{ contact: SharedContact }>("/api/me/contact", { method: "PUT", json: { ...cur, linkedinUrl: url.trim() } });
      setSaved(r.contact.linkedinUrl);
      window.dispatchEvent(new Event("venn:contact-updated"));
      toast.success(r.contact.linkedinUrl ? "LinkedIn link added to your profile." : "LinkedIn link removed.");
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }

  return (
    <section id="linkedin" aria-labelledby="li-h" className="rounded-lg border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <LinkedInMark className="mt-0.5 size-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 id="li-h" className="text-title-3">
            {st.connected ? <span className="inline-flex items-center gap-1.5">LinkedIn connected <Check className="size-4 text-success" aria-label="connected" /></span> : "Connect your LinkedIn"}
          </h2>
          <p className="mt-0.5 text-body-sm text-text-muted">
            {st.connected
              ? "Add your LinkedIn profile link. Signed-in GT members will see a LinkedIn button on your profile."
              : "Link your LinkedIn so GT members can open it from your Venn profile. LinkedIn only shares your name with Venn."}
          </p>
        </div>
      </div>
      {!st.connected ? (
        <LinkedInButton ready={st.ready} className="mt-4 sm:w-auto sm:px-5" label="Connect LinkedIn" />
      ) : (
        <form onSubmit={saveUrl} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Label htmlFor="li-url" className="sr-only">Your LinkedIn profile link</Label>
          <Input id="li-url" type="url" inputMode="url" placeholder="https://www.linkedin.com/in/your-name" value={url} onChange={(e) => setUrl(e.target.value)} className="sm:flex-1" />
          <Button type="submit" variant="outline" disabled={busy || url.trim() === (saved ?? "")}>{busy && <Loader2 className="animate-spin" />} {saved ? "Update link" : "Add to profile"}</Button>
        </form>
      )}
      {err && <p role="alert" className="mt-2 text-[13px] font-medium text-danger">{err}</p>}
    </section>
  );
}

function ContactSharing() {
  const [c, setC] = useState<SharedContact | null>(null);
  const [on, setOn] = useState<Record<keyof SharedContact, boolean>>({ preferredEmail: false, phone: false, linkedinUrl: false, websiteUrl: false });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = () => api<{ contact: SharedContact }>("/api/me/contact").then((r) => {
      setC(r.contact);
      setOn({ preferredEmail: !!r.contact.preferredEmail, phone: !!r.contact.phone, linkedinUrl: !!r.contact.linkedinUrl, websiteUrl: !!r.contact.websiteUrl });
    }).catch((e) => setErr(e.message));
    load();
    window.addEventListener("venn:contact-updated", load); // the LinkedIn card above saved a link
    return () => window.removeEventListener("venn:contact-updated", load);
  }, []);

  async function save() {
    if (!c) return;
    setSaving(true); setErr(null);
    const payload = Object.fromEntries((Object.keys(on) as (keyof SharedContact)[]).map((k) => [k, on[k] ? (c[k] ?? "") : ""]));
    try {
      const r = await api<{ contact: SharedContact }>("/api/me/contact", { method: "PUT", json: payload });
      setC(r.contact);
      toast.success("Contact sharing saved.");
    } catch (e) { setErr((e as Error).message); }
    setSaving(false);
  }

  const FIELDS: { k: keyof SharedContact; label: string; type: string; ph: string }[] = [
    { k: "preferredEmail", label: "Preferred email", type: "email", ph: "you@example.com" },
    { k: "phone", label: "Phone", type: "tel", ph: "+1 404 555 0100" },
    { k: "linkedinUrl", label: "LinkedIn", type: "url", ph: "https://www.linkedin.com/in/…" },
    { k: "websiteUrl", label: "Personal website", type: "url", ph: "https://…" },
  ];

  return (
    <section aria-labelledby="share-h" className="space-y-4 rounded-lg border border-line bg-surface p-6 shadow-card">
      <div>
        <h2 id="share-h" className="font-semibold">Share contact details (optional)</h2>
        <p className="text-sm text-text-muted">Off by default. Anything you turn on is visible to <strong>signed-in GT members only</strong>, never to the public or to AI, and each view is logged. Without it, people reach you only through Venn&apos;s email relay.</p>
      </div>
      {!c && !err && <Skeleton className="h-24 w-full" />}
      {err && <ErrorState message={err} />}
      {c && (
        <div className="space-y-3">
          {FIELDS.map((f) => (
            <div key={f.k} className="grid items-center gap-2 sm:grid-cols-[180px_1fr]">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={on[f.k]} onCheckedChange={(v) => setOn((o) => ({ ...o, [f.k]: v === true }))} aria-label={`Share ${f.label}`} />
                {f.label}
              </label>
              <Input type={f.type} placeholder={f.ph} disabled={!on[f.k]} value={c[f.k] ?? ""} aria-label={f.label}
                onChange={(e) => setC({ ...c, [f.k]: e.target.value })} />
            </div>
          ))}
          <div className="flex justify-end"><Button variant="outline" onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />}Save sharing</Button></div>
        </div>
      )}
    </section>
  );
}

export default function ProfilePage() {
  return <Suspense><ProfileInner /></Suspense>;
}
