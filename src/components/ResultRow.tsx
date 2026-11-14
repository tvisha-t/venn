"use client";
import { forwardRef } from "react";
import { PersonAvatar } from "@/components/PersonAvatar";
import { type PublicProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

export function titleCompany(p: Pick<PublicProfile, "jobTitle" | "employer" | "roles" | "major">) {
  if (p.jobTitle && p.employer) return `${p.jobTitle} · ${p.employer}`;
  if (p.employer) return p.employer;
  if (p.roles.includes("student")) return `${p.major ?? "GT"} student`;
  return "Role not listed";
}

export function classCity(p: Pick<PublicProfile, "classYear" | "city">) {
  return [p.classYear ? `Class of '${String(p.classYear).slice(2)}` : null, p.city].filter(Boolean).join(" · ");
}

export function UnclaimedBadge() {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[12px] font-medium text-ink-2" title="From Alumni Association records; hasn't joined Venn yet">
      Unclaimed
    </span>
  );
}

/** Compact, keyboard-selectable result row (listbox option). */
export const ResultRow = forwardRef<HTMLButtonElement, {
  profile: PublicProfile; reason?: string; isNew?: boolean; selected?: boolean; onSelect: () => void;
}>(function ResultRow({ profile: p, reason, isNew, selected, onSelect }, ref) {
  return (
    <button
      ref={ref} type="button" role="option" aria-selected={selected} onClick={onSelect}
      className={cn(
        "relative flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-offset-[-2px]",
        selected && "bg-brand-tint hover:bg-brand-tint",
      )}
    >
      {selected && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-brand" aria-hidden />}
      <PersonAvatar first={p.firstName} last={p.lastName} size={36} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14px] font-semibold text-ink">{p.firstName} {p.lastName}</span>
          {isNew && <span className="rounded-full bg-petal-tint px-1.5 py-0.5 text-[11px] font-semibold text-petal-text">New</span>}
          {p.status === "unclaimed" && <span className="ml-auto shrink-0"><UnclaimedBadge /></span>}
        </span>
        <span className="block truncate text-[13px] text-ink">{titleCompany(p)}</span>
        <span className="block truncate text-meta text-ink-2">{classCity(p)}</span>
        {reason && (
          <span className="mt-1 line-clamp-1 text-meta text-ink-2">
            <span className="font-medium text-petal-text">Why</span> {reason}
          </span>
        )}
      </span>
    </button>
  );
});
