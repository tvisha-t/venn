"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Bell, Bookmark, Compass, Home, Inbox, LogOut, Search, Send, Shield, UserRound } from "lucide-react";
import { api, type OwnProfile } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/PersonAvatar";

type Me = { profile: OwnProfile; unseenReplies: number; graduationPrompt: boolean; checkIn: boolean };
const MeCtx = createContext<{ me: Me | null; refresh: () => void }>({ me: null, refresh: () => {} });
export const useMe = () => useContext(MeCtx);

const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/requests", label: "Requests", icon: Send },
  { href: "/goals", label: "Saved goals", icon: Bookmark },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const path = usePathname();
  const router = useRouter();
  const refresh = useCallback(() => {
    api<Me>("/api/me").then(setMe).catch(() => {});
  }, []);
  useEffect(refresh, [refresh, path]);

  useEffect(() => {
    if (me && !me.profile.summaryApproved && path !== "/profile") router.replace("/profile");
  }, [me, path, router]);

  async function signOut() {
    await api("/api/auth/signout", { method: "POST" });
    router.replace("/signin");
  }

  const isActive = (href: string) => path === href || path.startsWith(href + "/") || (href === "/goals" && path.startsWith("/goals"));

  return (
    <MeCtx.Provider value={{ me, refresh }}>
      <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
        {/* Sidebar (desktop) */}
        <aside className="sticky top-0 hidden h-screen flex-col border-r bg-surface px-3 py-4 md:flex">
          <Link href="/home" className="mb-6 flex items-baseline gap-2 px-2" aria-label="venn home">
            <span className="text-[24px] font-bold leading-none tracking-[-0.04em] text-brand">venn</span>
            <span className="rounded-full bg-petal-tint px-1.5 py-0.5 text-[11px] font-medium text-petal-text">Georgia Tech</span>
          </Link>
          <nav aria-label="Main" className="flex flex-col gap-0.5">
            {NAV.map((n) => {
              const active = isActive(n.href);
              return (
                <Link
                  key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] font-medium text-ink-2 transition-colors hover:bg-muted hover:text-ink",
                    active && "bg-muted text-ink before:absolute before:inset-y-1.5 before:-left-3 before:w-[3px] before:rounded-r before:bg-petal",
                  )}
                >
                  <n.icon className={cn("size-4", active ? "text-brand" : "text-ink-3")} aria-hidden />
                  {n.label}
                  {n.href === "/requests" && (me?.unseenReplies ?? 0) > 0 && (
                    <span className="ml-auto rounded-full bg-petal-tint px-1.5 text-[11px] font-semibold text-petal-text" aria-label={`${me!.unseenReplies} new replies`}>
                      {me!.unseenReplies}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <p className="mt-auto px-2 text-[12px] leading-snug text-ink-2">Student project for Georgia Tech. Demo data is fictional.</p>
        </aside>

        <div className="flex min-w-0 flex-col">
          <TopBar me={me} onSignOut={signOut} />
          {me?.graduationPrompt && <GraduationBanner onDone={refresh} year={me.profile.classYear} />}
          {me?.checkIn && !me.graduationPrompt && <CheckInBanner employer={me.profile.employer} onDone={refresh} />}
          <main id="main" className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-10 md:pt-8">{children}</main>
        </div>
      </div>

      {/* Bottom tab bar (phones) */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-surface md:hidden">
        {NAV.map((n) => {
          const active = isActive(n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
              className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-ink-2", active && "text-brand")}>
              {active && <span className="absolute top-0 h-[2px] w-8 rounded-b bg-petal" aria-hidden />}
              <n.icon className="size-5" aria-hidden />
              {n.label === "Saved goals" ? "Goals" : n.label}
              {n.href === "/requests" && (me?.unseenReplies ?? 0) > 0 && <span className="absolute right-[28%] top-1.5 size-2 rounded-full bg-petal" aria-label="new replies" />}
            </Link>
          );
        })}
      </nav>
    </MeCtx.Provider>
  );
}

function TopBar({ me, onSignOut }: { me: Me | null; onSignOut: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-surface/95 px-4 backdrop-blur sm:px-6">
      <Link href="/home" className="text-[22px] font-bold leading-none tracking-[-0.04em] text-brand md:hidden" aria-label="venn home">venn</Link>
      <form
        role="search" className="relative flex-1 md:max-w-[520px]"
        onSubmit={(e) => { e.preventDefault(); const v = q.trim(); if (v.length >= 2) { router.push(`/home?goal=${encodeURIComponent(v)}`); setQ(""); ref.current?.blur(); } }}
      >
        <label htmlFor="ask" className="sr-only">Ask Venn</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          id="ask" ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask Venn…"
          className="h-9 w-full rounded-md border bg-muted/60 pl-9 pr-14 text-[14px] outline-none transition-colors focus:border-line focus:bg-surface"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-2 sm:block">⌘K</kbd>
      </form>
      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full" aria-label="Account menu">
              {me ? <PersonAvatar first={me.profile.firstName} last={me.profile.lastName} size={32} /> : <span className="block size-8 rounded-full bg-muted" />}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {me && (
              <DropdownMenuLabel className="font-normal">
                <p className="text-[14px] font-medium">{me.profile.firstName} {me.profile.lastName}</p>
                <p className="text-meta text-ink-2">{me.profile.major ?? me.profile.employer ?? "Georgia Tech"}</p>
              </DropdownMenuLabel>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/profile"><UserRound /> Profile</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/dev/inbox"><Inbox /> Sandbox inbox</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/admin"><Shield /> Admin (demo)</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSignOut}><LogOut /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b bg-surface">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 px-4 py-2.5 text-[14px] sm:px-6">
        <Bell className="size-4 text-petal-text" aria-hidden />
        {children}
      </div>
    </div>
  );
}

function GraduationBanner({ year, onDone }: { year: number | null; onDone: () => void }) {
  return (
    <Banner>
      <span>Your class year ({year}) has passed. <strong className="font-medium">Did you graduate?</strong></span>
      <Button size="sm" onClick={() => api("/api/me", { method: "PATCH", json: { graduated: true } }).then(onDone)}>Yes, I&apos;m an alum now</Button>
    </Banner>
  );
}

function CheckInBanner({ employer, onDone }: { employer: string | null; onDone: () => void }) {
  return (
    <Banner>
      <span>Still at <strong className="font-medium">{employer}</strong>?</span>
      <Button size="sm" variant="outline" onClick={() => api("/api/me", { method: "PATCH", json: { touch: true } }).then(onDone)}>Yes</Button>
      <Button size="sm" variant="ghost" asChild><Link href="/profile">Update</Link></Button>
    </Banner>
  );
}
