"use client";
// Small accessible toggle (role="switch").
export function Switch({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-[14px] font-medium">
      <button
        id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-brand" : "bg-ink-3"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
      {label}
    </label>
  );
}
