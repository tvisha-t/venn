import { AlertCircle, Inbox, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for compact list rows (results, explore, requests). */
export function LoadingRows({ n = 6, label = "Loading" }: { n?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className="divide-y rounded-lg border bg-surface">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

/** Back-compat alias used by older screens. */
export const LoadingCards = LoadingRows;

export function EmptyState({ title, children, action, icon: Icon = Inbox }: { title: string; children?: React.ReactNode; action?: React.ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rounded-lg border bg-surface px-6 py-12 text-center">
      <span className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-muted"><Icon className="size-5 text-ink-2" aria-hidden /></span>
      <p className="text-[15px] font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-sm text-ink-2">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger/20 bg-danger-bg px-4 py-3">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
      <div className="flex-1">
        <p className="font-medium text-danger">Something went wrong</p>
        <p className="text-ink-2">{message}</p>
      </div>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
