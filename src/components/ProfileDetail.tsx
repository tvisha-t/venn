"use client";
import { useEffect, useState } from "react";
import { Globe, Link2, Mail, MapPin, Phone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { PersonAvatar } from "@/components/PersonAvatar";
import { UnclaimedBadge, classCity, titleCompany } from "@/components/ResultRow";
import { api, ROLE_LABEL, type IntroStatus, type PublicProfile, type SharedContact } from "@/lib/api";

type Resp = { profile: PublicProfile; sharesContact: boolean; myIntro: { id: string; status: IntroStatus } | null };

export function Pills({ items, max }: { items: string[]; max?: number }) {
  if (!items.length) return null;
  const shown = max ? items.slice(0, max) : items;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((x) => <li key={x} className="rounded-full bg-muted px-2.5 py-1 text-[13px] text-ink">{x}</li>)}
      {max && items.length > max && <li className="rounded-full px-1.5 py-1 text-[13px] text-ink-2">+{items.length - max}</li>}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-medium text-ink-2">{title}</h3>
      {children}
    </section>
  );
}

const STATUS_TEXT: Partial<Record<IntroStatus, string>> = {
  sent: "Intro sent — waiting for a reply", replied: "Replied — check your email", not_interested: "They passed on your intro",
  no_response: "No response to your intro", bounced: "Your intro couldn't be delivered", suppressed: "No email on file",
};

/** The selected-profile pane (split view) and the body of the profile slide-over. */
export function ProfileDetail({ id, reason, onRequest, headerless }: { id: string; reason?: string; onRequest: (p: PublicProfile) => void; headerless?: boolean }) {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [contact, setContact] = useState<SharedContact | null>(null);
  const [contactErr, setContactErr] = useState<string | null>(null);

  function load() {
    setData(null); setErr(null); setContact(null); setContactErr(null);
    api<Resp>(`/api/profiles/${id}`).then(setData).catch((e) => setErr(e.message));
  }
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function reveal() {
    try { setContact((await api<{ contact: SharedContact }>(`/api/profiles/${id}/contact`)).contact); }
    catch (e) { setContactErr((e as Error).message); }
  }

  if (err) return <div className="p-6"><ErrorState message={err} onRetry={load} /></div>;
  if (!data) {
    return (
      <div className="space-y-4 p-6" role="status" aria-label="Loading profile">
        <div className="flex items-center gap-3"><Skeleton className="size-14 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4 w-2/3" /></div></div>
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const p = data.profile;
  const sent = data.myIntro && data.myIntro.status !== "draft";
  const cta = sent ? (
    <p className="text-meta text-ink-2">{STATUS_TEXT[data.myIntro!.status] ?? "Intro in progress"}</p>
  ) : p.acceptingIntros ? (
    <Button onClick={() => onRequest(p)}><Send /> Request intro</Button>
  ) : (
    <Button disabled>Not accepting intros</Button>
  );

  return (
    <article aria-label={`${p.firstName} ${p.lastName}`} className="space-y-6 p-6">
      {!headerless && (
        <header className="flex flex-wrap items-start gap-4">
          <PersonAvatar first={p.firstName} last={p.lastName} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-section">{p.firstName} {p.lastName}</h2>
              {p.status === "unclaimed" && <UnclaimedBadge />}
            </div>
            <p className="text-[14px] text-ink">{titleCompany(p)}</p>
            <p className="flex items-center gap-1 text-meta text-ink-2"><MapPin className="size-3.5" aria-hidden />{classCity(p) || "Georgia Tech"}</p>
          </div>
          <div className="w-full sm:w-auto">{cta}</div>
        </header>
      )}
      {headerless && <div>{cta}</div>}

      {reason && (
        <div className="rounded-lg bg-petal-tint px-4 py-3">
          <p className="text-[13px] font-medium text-petal-text">Why Venn picked them</p>
          <p className="text-[14px]">{reason}</p>
        </div>
      )}

      {p.summary && <Section title="About"><p className="leading-relaxed">{p.summary}</p></Section>}

      <Section title="Details">
        <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-[14px]">
          <dt className="text-ink-2">Role</dt><dd>{p.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ")}</dd>
          {p.classYear && <><dt className="text-ink-2">Class</dt><dd>{p.classYear}{p.degree ? ` · ${p.degree}` : ""}</dd></>}
          {p.major && <><dt className="text-ink-2">Major</dt><dd>{p.major}</dd></>}
          {p.industry && <><dt className="text-ink-2">Industry</dt><dd>{p.industry}</dd></>}
          {p.city && <><dt className="text-ink-2">Location</dt><dd>{p.city}{p.state ? `, ${p.state}` : ""}</dd></>}
        </dl>
      </Section>

      {p.gtPrograms.length > 0 && <Section title="GT programs"><Pills items={p.gtPrograms} /></Section>}
      {p.openTo.length > 0 && <Section title="Open to"><Pills items={p.openTo} /></Section>}
      {p.interests.length > 0 && <Section title="Interests"><Pills items={p.interests} /></Section>}

      {data.sharesContact && (
        <Section title="Contact details">
          <p className="text-meta text-ink-2">{p.firstName} chose to share these with signed-in GT members. Views are logged.</p>
          {!contact && !contactErr && <Button size="sm" variant="outline" onClick={reveal}>Show contact details</Button>}
          {contactErr && <p className="text-danger">{contactErr}</p>}
          {contact && (
            <ul className="space-y-1.5">
              {contact.preferredEmail && <li className="flex items-center gap-2"><Mail className="size-4 text-ink-3" aria-hidden /><a className="underline-offset-2 hover:underline" href={`mailto:${contact.preferredEmail}`}>{contact.preferredEmail}</a></li>}
              {contact.phone && <li className="flex items-center gap-2"><Phone className="size-4 text-ink-3" aria-hidden /><a className="underline-offset-2 hover:underline" href={`tel:${contact.phone}`}>{contact.phone}</a></li>}
              {contact.linkedinUrl && <li className="flex items-center gap-2"><Link2 className="size-4 text-ink-3" aria-hidden /><a className="underline-offset-2 hover:underline" href={contact.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn</a></li>}
              {contact.websiteUrl && <li className="flex items-center gap-2"><Globe className="size-4 text-ink-3" aria-hidden /><a className="underline-offset-2 hover:underline" href={contact.websiteUrl} target="_blank" rel="noopener noreferrer">Website</a></li>}
            </ul>
          )}
        </Section>
      )}

      {p.status === "unclaimed" && (
        <p className="rounded-lg bg-muted px-4 py-3 text-meta text-ink-2">
          Listed from GT Alumni Association records. {p.firstName} hasn&apos;t joined Venn yet. An intro reaches them by email, and they can claim or remove this listing.
        </p>
      )}
    </article>
  );
}
