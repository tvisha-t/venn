"use client";
import { useEffect, useState } from "react";
import { Check, Globe, Link2, Lock, Mail, Phone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { PersonAvatar } from "@/components/PersonAvatar";
import { LinkedInMark } from "@/components/LinkedInButton";
import { UnclaimedBadge, majorShort, shortYear } from "@/components/ResultRow";
import { useMe } from "@/components/AppShell";
import { overlapReasons, useDistanceBand } from "@/lib/overlap";
import { api, ROLE_LABEL, type IntroStatus, type PublicProfile, type SharedContact } from "@/lib/api";

type Resp = {
  profile: PublicProfile; sharesContact: boolean; myIntro: { id: string; status: IntroStatus } | null;
  linkedin?: { connected: boolean; shared: boolean };
};

/**
 * "LinkedIn" button for members who connected LinkedIn and shared their profile link. The link is fetched
 * from the audited contact endpoint on click (the window opens first, so pop-up blockers allow it).
 */
function LinkedInLink({ id, name }: { id: string; name: string }) {
  async function open() {
    const w = window.open("about:blank", "_blank");
    try {
      const { contact } = await api<{ contact: SharedContact }>(`/api/profiles/${id}/contact`);
      if (contact.linkedinUrl && w) { w.opener = null; w.location.href = contact.linkedinUrl; } else w?.close();
    } catch { w?.close(); }
  }
  return (
    <button type="button" onClick={open} aria-label={`Open ${name}'s LinkedIn profile (new tab)`}
      className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-brand-line bg-brand-raised px-3 text-label text-on-brand hover:bg-brand">
      <LinkedInMark className="size-4" /> LinkedIn
    </button>
  );
}

export function Pills({ items, max }: { items: string[]; max?: number }) {
  if (!items.length) return null;
  const shown = max ? items.slice(0, max) : items;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((x) => <li key={x} className="rounded-full bg-accent-soft px-3 py-1 text-label text-accent-ink">{x.charAt(0).toUpperCase() + x.slice(1)}</li>)}
      {max && items.length > max && <li className="rounded-full px-1.5 py-1 text-label text-text-subtle">+{items.length - max}</li>}
    </ul>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-title-3">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

const STATUS_TEXT: Partial<Record<IntroStatus, string>> = {
  sent: "Intro sent. Waiting for a reply.", replied: "They replied. Check your email.", not_interested: "They passed on your intro.",
  no_response: "No response to your intro.", bounced: "Your intro couldn't be delivered.", suppressed: "No email on file.",
};

/** The selected-profile pane (split view) and the body of the profile slide-over. */
export function ProfileDetail({ id, reason, onRequest }: { id: string; reason?: string; onRequest: (p: PublicProfile) => void; headerless?: boolean }) {
  const { me } = useMe();
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [contact, setContact] = useState<SharedContact | null>(null);
  const [contactErr, setContactErr] = useState<string | null>(null);

  function load() {
    setData(null); setErr(null); setContact(null); setContactErr(null);
    api<Resp>(`/api/profiles/${id}`).then(setData).catch((e) => setErr(e.message));
  }
  useEffect(load, [id]);
  const band = useDistanceBand(me?.profile.city, data?.profile.city, data?.profile.state);

  async function reveal() {
    try { setContact((await api<{ contact: SharedContact }>(`/api/profiles/${id}/contact`)).contact); }
    catch (e) { setContactErr((e as Error).message); }
  }

  if (err) return <div className="rounded-lg border border-line bg-surface p-6"><ErrorState message={err} onRetry={load} /></div>;
  if (!data) {
    return (
      <div className="overflow-hidden rounded-lg border border-line bg-surface" role="status" aria-label="Loading profile">
        <div className="flex items-center gap-4 bg-brand p-6"><Skeleton className="size-14 rounded-full bg-brand-raised" /><div className="flex-1 space-y-2"><Skeleton className="h-6 w-1/2 bg-brand-raised" /><Skeleton className="h-4 w-2/3 bg-brand-raised" /></div></div>
        <div className="space-y-3 p-6"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-16 w-full" /></div>
      </div>
    );
  }

  const p = data.profile;
  const sent = data.myIntro && data.myIntro.status !== "draft";
  const reasons = [...(reason ? [reason.replace(/\.?$/, ".")] : []), ...overlapReasons(me?.profile, p)];
  const openMatch = me?.profile.roles.includes("student") && p.openTo.includes("mentoring students");
  if (openMatch) reasons.push("Marked open to mentoring students.");
  const roleLine = [p.jobTitle && p.employer ? `${p.jobTitle} at ${p.employer}` : p.employer ?? (p.roles.includes("student") ? `${p.major ?? "GT"} student` : "Role not listed"),
    [p.major, shortYear(p)].filter(Boolean).join(" ")].filter(Boolean).join(" · ");

  return (
    <article aria-label={`${p.firstName} ${p.lastName}`} className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      {/* Navy brand header (the one brand panel on this screen) */}
      <header className="on-brand flex items-start gap-4 bg-brand px-6 py-6 text-on-brand">
        <span className="rounded-full p-[3px] ring-2 ring-accent"><PersonAvatar first={p.firstName} last={p.lastName} size={52} className="bg-surface text-primary" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-title-1 text-on-brand">{p.firstName} {p.lastName}</h2>
          <p className="text-body-sm text-on-brand-muted">{roleLine}</p>
          {data.linkedin?.connected && data.linkedin.shared && <LinkedInLink id={p.id} name={p.firstName} />}
        </div>
        <div className="shrink-0 text-right">
          {band && <p className="font-mono text-[15px] text-on-brand">{band}</p>}
          {p.city && <p className="text-body-sm text-on-brand-muted">{p.city}{p.state ? `, ${p.state}` : ""}</p>}
        </div>
      </header>

      <div className="space-y-6 p-6">
        {p.status === "unclaimed" && (
          <div className="flex items-start gap-2"><UnclaimedBadge /><p className="text-body-sm text-text-muted">Listed from GT Alumni Association records. An intro reaches {p.firstName} by email, and they can claim or remove this listing.</p></div>
        )}

        {reasons.length > 0 && (
          <Section title="Why Venn matched you">
            <ul className="space-y-2">
              {reasons.map((r) => (
                <li key={r} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-sm bg-accent-soft"><Check className="size-3.5 stroke-[2.5] text-accent-ink" aria-hidden /></span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {p.openTo.length > 0 && <Section title="Open to"><Pills items={p.openTo} /></Section>}

        {p.summary && <Section title="About"><p className="text-text-muted">{p.summary}</p></Section>}

        <Section title="Details">
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5">
            <dt className="text-text-muted">Role</dt><dd>{p.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ")}</dd>
            {p.classYear && <><dt className="text-text-muted">Class</dt><dd><span className="font-mono">{p.classYear}</span>{p.degree ? ` · ${p.degree}` : ""}</dd></>}
            {p.major && <><dt className="text-text-muted">Major</dt><dd>{p.major}{majorShort(p.major) !== p.major ? ` (${majorShort(p.major)})` : ""}</dd></>}
            {p.industry && <><dt className="text-text-muted">Industry</dt><dd>{p.industry}</dd></>}
            {p.gtPrograms.length > 0 && <><dt className="text-text-muted">GT programs</dt><dd>{p.gtPrograms.join(", ")}</dd></>}
            {p.activities.length > 0 && <><dt className="text-text-muted">Activities</dt><dd>{p.activities.join(", ")}</dd></>}
          </dl>
        </Section>

        {data.sharesContact && (
          <Section title="Contact details">
            <p className="text-body-sm text-text-muted">{p.firstName} chose to share these with signed-in GT members. Views are logged.</p>
            {!contact && !contactErr && <Button size="sm" variant="outline" onClick={reveal}>Show contact details</Button>}
            {contactErr && <p className="text-danger">{contactErr}</p>}
            {contact && (
              <ul className="space-y-2">
                {contact.preferredEmail && <li className="flex items-center gap-2"><Mail className="size-5 stroke-[1.75] text-text-muted" aria-hidden /><a className="text-link hover:underline" href={`mailto:${contact.preferredEmail}`}>{contact.preferredEmail}</a></li>}
                {contact.phone && <li className="flex items-center gap-2"><Phone className="size-5 stroke-[1.75] text-text-muted" aria-hidden /><a className="font-mono text-link hover:underline" href={`tel:${contact.phone}`}>{contact.phone}</a></li>}
                {contact.linkedinUrl && <li className="flex items-center gap-2"><Link2 className="size-5 stroke-[1.75] text-text-muted" aria-hidden /><a className="text-link hover:underline" href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn</a></li>}
                {contact.websiteUrl && <li className="flex items-center gap-2"><Globe className="size-5 stroke-[1.75] text-text-muted" aria-hidden /><a className="text-link hover:underline" href={contact.websiteUrl} target="_blank" rel="noopener noreferrer">Website</a></li>}
              </ul>
            )}
          </Section>
        )}

        <div className="space-y-3 border-t border-line pt-5">
          {sent ? (
            <p className="rounded-md bg-surface-raised px-4 py-3 text-text-muted">{STATUS_TEXT[data.myIntro!.status] ?? "Intro in progress."}</p>
          ) : p.acceptingIntros ? (
            <Button size="lg" className="w-full" onClick={() => onRequest(p)}><Send /> Request intro</Button>
          ) : (
            <Button size="lg" className="w-full" variant="outline" disabled>Not accepting intros</Button>
          )}
          <p className="flex items-start gap-2 rounded-md bg-primary-soft px-4 py-3 text-body-sm text-primary-ink">
            <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
            {p.firstName}&apos;s email stays hidden. If {p.firstName} replies, you can email each other directly.
          </p>
        </div>
      </div>
    </article>
  );
}
