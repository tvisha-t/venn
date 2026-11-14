"use client";
import { forwardRef } from "react";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Button } from "@/components/ui/button";
import { useMe } from "@/components/AppShell";
import { overlap, useDistanceBand } from "@/lib/overlap";
import { type PublicProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

export function shortYear(p: Pick<PublicProfile, "classYear">) {
  return p.classYear ? `'${String(p.classYear).slice(2)}` : "";
}

const MAJOR_SHORT: Record<string, string> = {
  "Computer Science": "CS", "Computer Engineering": "CmpE", "Electrical Engineering": "EE", "Mechanical Engineering": "ME",
  "Industrial Engineering": "ISyE", "Aerospace Engineering": "AE", "Industrial Design": "ID", "Business Administration": "Business",
};
export const majorShort = (m: string | null) => (m ? MAJOR_SHORT[m] ?? m : "");

/** "Product designer at Delta · CS '19" */
export function titleCompany(p: Pick<PublicProfile, "jobTitle" | "employer" | "roles" | "major" | "classYear">) {
  const year = [majorShort(p.major), shortYear(p)].filter(Boolean).join(" ");
  if (p.roles.includes("student")) return `${p.major ?? "GT"} student${p.classYear ? ` · Class of ${p.classYear}` : ""}`;
  const role = p.jobTitle && p.employer ? `${p.jobTitle} at ${p.employer}` : p.employer ?? "Role not listed";
  return year ? `${role} · ${year}` : role;
}

export function classCity(p: Pick<PublicProfile, "classYear" | "city">) {
  return [p.classYear ? `Class of '${String(p.classYear).slice(2)}` : null, p.city].filter(Boolean).join(" · ");
}

export function UnclaimedBadge() {
  return (
    <span className="rounded-sm bg-surface-raised px-2 py-0.5 text-label text-text-muted" title="From Alumni Association records; hasn't joined Venn yet">
      Not on Venn yet
    </span>
  );
}

/** "You both: RoboJackets · Computer Science · Atlanta" with the highlighter. */
export function OverlapRow({ items, compact }: { items: string[]; compact?: boolean }) {
  return (
    <p className={cn("rounded-md bg-surface-raised text-text-muted", compact ? "px-3 py-2 text-body-sm" : "px-3 py-2.5 text-[14px]")}>
      You both:{" "}
      {items.length ? items.map((x, i) => (
        <span key={x}>{i > 0 && <span aria-hidden> · </span>}<span className="hl text-text">{x}</span></span>
      )) : <span className="text-text">Georgia Tech</span>}
    </p>
  );
}

/** Person card (Find / Explore results). Never shows an email or phone. */
export const ResultRow = forwardRef<HTMLButtonElement, {
  profile: PublicProfile; reason?: string; isNew?: boolean; selected?: boolean; onSelect: () => void; onRequest?: () => void;
}>(function ResultRow({ profile: p, isNew, selected, onSelect, onRequest }, ref) {
  const { me } = useMe();
  const shared = overlap(me?.profile, p);
  const band = useDistanceBand(me?.profile.city, p.city, p.state);
  return (
    <article
      aria-current={selected ? "true" : undefined}
      className={cn(
        "rounded-lg border bg-surface p-5 shadow-card transition-colors",
        selected ? "border-2 border-primary p-[19px]" : "border-line hover:border-line-control",
      )}
    >
      <button ref={ref} type="button" onClick={onSelect} aria-pressed={selected}
        className="flex w-full items-start gap-3 rounded-md text-left focus-visible:outline-offset-4">
        <PersonAvatar first={p.firstName} last={p.lastName} size={44} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-title-3 text-text">{p.firstName} {p.lastName}</span>
            {isNew && <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 text-label text-accent-ink">New</span>}
          </span>
          <span className="block truncate text-body-sm text-text-muted">{titleCompany(p)}</span>
        </span>
        {band && <span className="shrink-0 pt-0.5 text-mono-sm text-text-subtle" title="Approximate distance between cities">{band}</span>}
      </button>
      <div className="mt-3"><OverlapRow items={shared} compact /></div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {p.status === "unclaimed" && <UnclaimedBadge />}
          {p.openTo.slice(0, p.status === "unclaimed" ? 1 : 2).map((o) => (
            <span key={o} className="truncate rounded-full bg-accent-soft px-3 py-1 text-label text-accent-ink">{o.charAt(0).toUpperCase() + o.slice(1)}</span>
          ))}
        </div>
        {onRequest && (
          p.acceptingIntros
            ? <Button size="sm" className="h-10" variant={selected ? "default" : "outline"} onClick={onRequest}>Request intro</Button>
            : <Button size="sm" className="h-10" variant="outline" disabled>Not accepting intros</Button>
        )}
      </div>
    </article>
  );
});
