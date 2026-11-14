"use client";
import Link from "next/link";
import { Building2, Check, EyeOff, Globe, Heart, Landmark, Music, Scale, Shield, Ship, Star, Trophy, Truck, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GroupItem } from "@/server/groups";

const ICONS: Record<string, LucideIcon> = {
  music: Music, scale: Scale, users: Users, globe: Globe, ship: Ship, star: Star, trophy: Trophy, heart: Heart,
  shield: Shield, building: Building2, truck: Truck, landmark: Landmark,
};

export const CATEGORY_LABEL: Record<string, string> = {
  profession: "Profession", identity: "Identity & heritage", campus: "Campus activities", military: "Military & service", college: "Colleges",
};

export function GroupIcon({ icon, size = 44, dark = false }: { icon: string; size?: number; dark?: boolean }) {
  const I = ICONS[icon] ?? Users;
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-md", dark ? "bg-brand-raised text-accent" : "bg-accent-soft text-accent-ink")} style={{ width: size, height: size }}>
      <I className="size-5" aria-hidden />
    </span>
  );
}

export function PrivatePill({ dark = false }: { dark?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-label", dark ? "border border-brand-line bg-brand-raised text-on-brand" : "bg-surface-raised text-text-muted")}>
      <EyeOff className="size-3.5" aria-hidden /> Private membership
    </span>
  );
}

/** One card in the directory. The name is a stretched link to the group page. */
export function GroupCard({ g, busy, onJoin }: { g: GroupItem; busy: boolean; onJoin: (g: GroupItem) => void }) {
  return (
    <li className="relative flex flex-col rounded-lg border border-line bg-surface p-5 shadow-card">
      <GroupIcon icon={g.icon} />
      <h3 className="mt-3 text-[16px] font-bold leading-[21px]">
        <Link href={`/groups/${g.slug}`} className="after:absolute after:inset-0 after:rounded-lg">{g.name}</Link>
      </h3>
      <p className="mt-1 text-body-sm text-text-muted">
        {g.sensitive ? <span className="inline-flex items-center gap-1"><EyeOff className="size-3.5" aria-hidden /> Private membership</span> : CATEGORY_LABEL[g.category]}
      </p>
      <p className="mt-2 line-clamp-2 text-body-sm text-text-muted">{g.description}</p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <span className="text-body-sm text-text-muted"><span className="font-mono text-text">{g.count}</span> on Venn</span>
        {g.joined ? (
          <Link href={`/groups/${g.slug}`} className="relative z-10 inline-flex h-10 items-center gap-1.5 rounded-md bg-success-soft px-4 text-body-sm font-semibold text-success">
            <Check className="size-4" aria-hidden /> Joined
          </Link>
        ) : (
          <button type="button" disabled={busy} onClick={() => onJoin(g)}
            className="relative z-10 inline-flex h-10 items-center rounded-md border border-line-control bg-surface px-4 text-body-sm font-semibold text-text hover:bg-surface-raised disabled:opacity-60"
            aria-label={`${g.sensitive ? "Join privately" : "Join"}: ${g.name}`}>
            {g.sensitive ? "Join privately" : "Join"}
          </button>
        )}
      </div>
    </li>
  );
}
