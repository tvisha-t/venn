import Link from "next/link";
import { cn } from "@/lib/utils";
import { VennMark } from "./VennMark";

type Size = "nav" | "mobile" | "login";
const SIZES: Record<Size, { mark: number; word: string }> = {
  nav: { mark: 28, word: "text-[22px]" },
  mobile: { mark: 28, word: "text-[20px]" },
  login: { mark: 36, word: "text-[28px]" },
};

/** Mark + "venn" wordmark. `onBrand` = white strokes and text, for navy panels. */
export function VennLogo({ size = "nav", onBrand = false, href = "/home", className }: { size?: Size; onBrand?: boolean; href?: string | null; className?: string }) {
  const s = SIZES[size];
  const inner = (
    <>
      <VennMark size={s.mark} stroke={onBrand ? "var(--on-brand)" : undefined} />
      <span className={cn("font-extrabold leading-none tracking-[-0.04em]", s.word, onBrand ? "text-on-brand" : "text-wordmark")}>venn</span>
    </>
  );
  const cls = cn("inline-flex items-center gap-2", className);
  if (href === null) return <span className={cls} role="img" aria-label="Venn">{inner}</span>;
  return <Link href={href} aria-label="Venn home" className={cls}>{inner}</Link>;
}

/** Full-page loading: the mark at 40px with a slow pulse (none under reduced motion). */
export function VennLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-[50vh] place-items-center">
      <VennMark size={40} className="venn-pulse" />
      <span className="sr-only">{label}…</span>
    </div>
  );
}
