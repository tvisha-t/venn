import { cn } from "@/lib/utils";

/** LinkedIn "in" mark (inline SVG; lucide has no brand icons). */
export function LinkedInMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-5", className)}>
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path fill="#fff" d="M7.1 9.6H4.6V19h2.5V9.6Zm.2-3a1.4 1.4 0 1 0-2.9 0 1.4 1.4 0 0 0 2.9 0ZM19.4 13.4c0-2.5-1.3-4-3.5-4-1.2 0-2 .6-2.4 1.3V9.6H11V19h2.5v-5c0-1.3.6-2.2 1.7-2.2s1.6.8 1.6 2.2v5h2.6v-5.6Z" />
    </svg>
  );
}

/**
 * "Continue with LinkedIn". Works once LINKEDIN_CLIENT_ID/SECRET are set; until then it shows
 * as "Coming soon" and does nothing. A plain link (full-page navigation), not a fetch.
 */
export function LinkedInButton({ ready, href = "/api/auth/linkedin/start", className, label = "Continue with LinkedIn" }: { ready: boolean; href?: string; className?: string; label?: string }) {
  const base = "inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-md border border-line-control bg-surface text-body-strong text-text";
  if (!ready) {
    return (
      <span aria-disabled="true" className={cn(base, "cursor-not-allowed opacity-60", className)}>
        <LinkedInMark /> {label}
        <span className="rounded-full bg-surface-raised px-2 py-0.5 text-label text-text-muted">Coming soon</span>
      </span>
    );
  }
  return (
    <a href={href} className={cn(base, "transition-colors hover:border-text-muted", className)}>
      <LinkedInMark /> {label}
    </a>
  );
}
