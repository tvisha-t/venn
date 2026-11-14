"use client";
// Small Venn UI primitives built on shadcn/ui: segmented control, pill-dropdown filter, split view.
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- segmented control
export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string;
}) {
  return (
    <ToggleGroup
      type="single" value={value} aria-label={label}
      onValueChange={(v) => v && onChange(v as T)}
      className="gap-0 rounded-lg bg-muted p-0.5"
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value} value={o.value}
          className="h-8 rounded-md px-3 text-[13px] font-medium text-ink-2 hover:bg-transparent hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-[0_1px_2px_rgba(15,27,45,0.08)]"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

// ---------------------------------------------------------------- pill dropdown filter
export type FilterOption = { value: string; label?: string; count?: number };

export function FilterPill({ label, value, options, onChange, loading }: {
  label: string; value: string | null; options: FilterOption[]; onChange: (v: string | null) => void; loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const active = value != null && value !== "";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn(
        "inline-flex h-8 shrink-0 items-center rounded-full border text-[13px] font-medium transition-colors",
        active ? "border-brand/20 bg-brand-tint text-brand" : "bg-surface text-ink hover:bg-muted",
      )}>
        <PopoverTrigger asChild>
          <button className="inline-flex h-full items-center gap-1 rounded-full pl-3 pr-2" aria-label={active ? `${label}: ${selected?.label ?? value}. Change` : `Filter by ${label}`}>
            {active ? <><span className="text-brand/70">{label}:</span> <span className="max-w-[140px] truncate">{selected?.label ?? value}</span></> : label}
            <ChevronDown className="size-3.5 opacity-60" aria-hidden />
          </button>
        </PopoverTrigger>
        {active && (
          <button onClick={() => onChange(null)} className="mr-1 grid size-6 place-items-center rounded-full hover:bg-brand/10" aria-label={`Clear ${label} filter`}>
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
      <PopoverContent align="start" className="w-64 p-1">
        <p className="px-2 pb-1 pt-1.5 text-[12px] font-medium text-ink-2">{label}</p>
        {loading && <p className="px-2 py-2 text-ink-2">Loading…</p>}
        {!loading && options.length === 0 && <p className="px-2 py-2 text-ink-2">No options for the current filters</p>}
        <ul role="listbox" aria-label={label} className="max-h-72 overflow-y-auto">
          {options.map((o) => {
            const on = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={on}>
                <button
                  onClick={() => { onChange(on ? null : o.value); setOpen(false); }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[14px] hover:bg-muted focus-visible:bg-muted"
                >
                  <Check className={cn("size-4 text-brand", on ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="flex-1 truncate">{o.label ?? o.value}</span>
                  {o.count != null && <span className="text-meta tabular-nums text-ink-2">{o.count}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------- split view
/** Handshake-style split: compact list (listbox) left, detail right. Stacks under 900px. */
export function SplitView({ label, count, selectedIndex, onSelectIndex, renderRow, detail, empty, footer }: {
  label: string;
  count: number;
  selectedIndex: number;
  onSelectIndex: (i: number) => void;
  renderRow: (i: number, ref: (el: HTMLButtonElement | null) => void) => React.ReactNode;
  detail: React.ReactNode;
  empty?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const detailRef = useRef<HTMLDivElement>(null);
  const userPicked = useRef(false);

  useEffect(() => {
    if (userPicked.current && window.matchMedia("(max-width: 899px)").matches) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    userPicked.current = false;
  }, [selectedIndex]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = Math.max(0, Math.min(count - 1, selectedIndex + (e.key === "ArrowDown" ? 1 : -1)));
    onSelectIndex(next);
    rows.current[next]?.focus();
  }

  if (count === 0) return <>{empty}</>;
  return (
    <div className="grid items-start gap-4 min-[900px]:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-lg border bg-surface">
        <div
          role="listbox" aria-label={label} onKeyDown={onKeyDown}
          className="divide-y min-[900px]:max-h-[calc(100vh-220px)] min-[900px]:overflow-y-auto"
          onClickCapture={() => { userPicked.current = true; }}
        >
          {Array.from({ length: count }).map((_, i) => renderRow(i, (el) => { rows.current[i] = el; }))}
        </div>
        {footer}
      </div>
      <div ref={detailRef} className="scroll-mt-20 rounded-lg border bg-surface min-[900px]:sticky min-[900px]:top-[76px] min-[900px]:max-h-[calc(100vh-100px)] min-[900px]:overflow-y-auto">
        {detail}
      </div>
    </div>
  );
}
