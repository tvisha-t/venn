"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Bell, Bookmark, Compass, Inbox, LogOut, MapPin, Search, Send, Shield, UserPlus, UserRound } from "lucide-react";
import { api, type OwnProfile } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/PersonAvatar";
import { InviteDialog } from "@/components/InviteDialog";
import { VennLogo } from "@/components/brand/VennLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

type Me = { profile: OwnProfile; unseenReplies: number; graduationPrompt: boolean; checkIn: boolean };
const MeCtx = createContext<{ me: Me | null; refresh: () => void }>({ me: null, refresh: () => {} });
export const useMe = () => useContext(MeCtx);

const NAV = [
  { href: "/home", label: "Find", icon: Search, match: ["/home", "/goals"] },
  { href: "/explore", label: "Explore", icon: Compass, match: ["/explore"] },
  { href: "/requests", label: "Requests", icon: Send, match: ["/requests"] },
  { href: "/profile", label: "Profile", icon: UserRound, match: ["/profile"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
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

  const isActive = (m: string[]) => m.some((x) => path === x || path.startsWith(x + "/"));
  const unseen = me?.unseenReplies ?? 0;

  return (
    <MeCtx.Provider value={{ me, refresh }}>
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-5 sm:px-6">
          <VennLogo size="nav" className="shrink-0 max-md:[&>span]:text-[20px]" />
          <nav aria-label="Main" className="hidden h-full items-stretch gap-7 md:flex">
            {NAV.map((n) => {
              const active = isActive(n.match);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                  className={cn("relative flex items-center gap-2 text-body-strong text-text-muted transition-colors hover:text-text", active && "text-text")}>
                  {n.label}
                  {n.href === "/requests" && unseen > 0 && (
                    <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 font-mono text-[11px] font-medium leading-5 text-on-primary" aria-label={`${unseen} new replies`}>{unseen}</span>
                  )}
                  {active && <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-accent" aria-hidden />}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {me?.profile.city && (
              <Link href="/explore?view=map" className="hidden h-9 items-center gap-1.5 rounded-full bg-surface-raised px-3 text-label text-text sm:inline-flex" aria-label={`Near ${me.profile.city}. Open map`}>
                <MapPin className="size-4 text-text-muted" aria-hidden /> {me.profile.city}
              </Link>
            )}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full" aria-label="Account menu">
                  {me ? <PersonAvatar first={me.profile.firstName} last={me.profile.lastName} size={32} /> : <span className="block size-8 rounded-full bg-surface-raised" />}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 rounded-md shadow-pop">
                {me && (
                  <DropdownMenuLabel className="font-normal">
                    <p className="text-title-3">{me.profile.firstName} {me.profile.lastName}</p>
                    <p className="text-body-sm text-text-muted">{me.profile.major ?? me.profile.employer ?? "Georgia Tech"}</p>
                  </DropdownMenuLabel>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/profile"><UserRound /> Profile</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/goals"><Bookmark /> Saved goals</Link></DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setInviteOpen(true)}><UserPlus /> Invite a Yellow Jacket</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/dev/inbox"><Inbox /> Sandbox inbox</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/admin"><Shield /> Admin (demo)</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut}><LogOut /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {me?.graduationPrompt && <GraduationBanner onDone={refresh} year={me.profile.classYear} />}
      {me?.checkIn && !me.graduationPrompt && <CheckInBanner employer={me.profile.employer} onDone={refresh} />}
      <main id="main" className="mx-auto w-full max-w-[1200px] px-5 pb-28 pt-6 sm:px-6 md:pb-12 md:pt-8">{children}</main>
      <footer className="mx-auto hidden max-w-[1200px] truncate px-6 pb-6 text-[12px] leading-4 text-text-subtle md:block">
        Venn is a student project, independent and not run by Georgia Tech. Demo data is fictional.
      </footer>

      {/* Bottom tab bar (phones) */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((n) => {
          const active = isActive(n.match);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
              className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-label text-text-muted", active && "text-primary")}>
              {active && <span className="absolute top-0 h-[3px] w-10 rounded-full bg-accent" aria-hidden />}
              <n.icon className="size-[22px] stroke-[1.75]" aria-hidden />
              {n.label}
              {n.href === "/requests" && unseen > 0 && <span className="absolute right-[26%] top-2.5 size-2 rounded-full bg-primary" aria-label="new replies" />}
            </Link>
          );
        })}
      </nav>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </MeCtx.Provider>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-3 px-5 py-3 sm:px-6">
        <Bell className="size-5 stroke-[1.75] text-text-muted" aria-hidden />
        {children}
      </div>
    </div>
  );
}

function GraduationBanner({ year, onDone }: { year: number | null; onDone: () => void }) {
  return (
    <Banner>
      <span>Your class year (<span className="font-mono">{year}</span>) has passed. <strong className="font-semibold">Did you graduate?</strong></span>
      <Button size="sm" onClick={() => api("/api/me", { method: "PATCH", json: { graduated: true } }).then(onDone)}>Yes, I&apos;m an alum</Button>
    </Banner>
  );
}

function CheckInBanner({ employer, onDone }: { employer: string | null; onDone: () => void }) {
  return (
    <Banner>
      <span>Still at <strong className="font-semibold">{employer}</strong>?</span>
      <Button size="sm" variant="outline" onClick={() => api("/api/me", { method: "PATCH", json: { touch: true } }).then(onDone)}>Yes</Button>
      <Button size="sm" variant="ghost" asChild><Link href="/profile">Update</Link></Button>
    </Banner>
  );
}
