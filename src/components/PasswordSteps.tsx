"use client";
import { useState } from "react";
import { AlertCircle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FIELD = "h-12 w-full rounded-md border border-line-control bg-surface px-4 pr-12 text-[15px] text-text outline-none transition-colors focus:border-primary";

function PasswordInput({ id, value, onChange, autoComplete, invalid }: { id: string; value: string; onChange: (v: string) => void; autoComplete: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete}
        aria-invalid={invalid} className={cn(FIELD, invalid && "border-2 border-danger focus:border-danger")} />
      <button type="button" onClick={() => setShow((x) => !x)} aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-md text-text-muted hover:text-text">
        {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

/** Sign in with email + password (accounts that set one). "Email me a code instead" covers forgotten passwords. */
export function PasswordStep({ email, onBack, onDone, onUseCode }: {
  email: string; onBack: () => void; onDone: (next: string) => void;
  onUseCode: (r: { expiresIn: number; resendIn: number }) => void;
}) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw) return;
    setBusy(true); setErr(null);
    try { onDone((await api<{ next: string }>("/api/auth/password", { method: "POST", json: { email, password: pw } })).next); }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  }

  async function useCode() {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ method: "code"; expiresIn: number; resendIn: number }>("/api/auth/start", { method: "POST", json: { email, forceCode: true } });
      onUseCode({ expiresIn: r.expiresIn, resendIn: r.resendIn });
    } catch (x) {
      const code = x instanceof ApiError ? x.code : undefined;
      if (code?.startsWith("cooldown:")) onUseCode({ expiresIn: 600, resendIn: Number(code.split(":")[1]) || 60 });
      else { setErr((x as Error).message); setBusy(false); }
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <span className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary-ink"><KeyRound className="size-5" aria-hidden /></span>
      <h2 className="text-title-2">Welcome back</h2>
      <p className="text-text-muted">Signing in as <strong className="font-semibold text-text">{email}</strong>. <button type="button" onClick={onBack} className="font-semibold text-link underline underline-offset-2">Change</button></p>
      <label htmlFor="password" className="block pt-1 text-[13px] font-semibold">Password</label>
      <PasswordInput id="password" value={pw} onChange={(v) => { setPw(v); setErr(null); }} autoComplete="current-password" invalid={!!err} />
      {err && <p role="alert" className="flex items-start gap-1.5 text-[13px] font-medium text-danger"><AlertCircle className="mt-px size-4 shrink-0" aria-hidden />{err}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy || !pw}>{busy && <Loader2 className="animate-spin" />} Sign in</Button>
      <p className="text-center text-body-sm text-text-muted">Forgot it? <button type="button" onClick={useCode} disabled={busy} className="font-semibold text-link underline underline-offset-2">Email me a code instead</button></p>
    </form>
  );
}

/** Right after a code sign-in: create a password (or choose a new one after "forgot"). Skippable. */
export function CreatePassword({ reset, onDone }: { reset: boolean; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { setErr("Use at least 8 characters."); return; }
    if (pw !== pw2) { setErr("The passwords don't match."); return; }
    setBusy(true); setErr(null);
    try { await api("/api/auth/set-password", { method: "POST", json: { password: pw } }); onDone(); }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  }

  return (
    <form onSubmit={save} className="space-y-3" noValidate>
      <span className="grid size-11 place-items-center rounded-full bg-success-soft text-success"><KeyRound className="size-5" aria-hidden /></span>
      <h2 className="text-title-2">{reset ? "Choose a new password" : "Create a password"}</h2>
      <p className="text-text-muted">{reset ? "You're signed in. Set a new password for next time." : "You're in. Next time, sign in with your email and this password instead of a code."}</p>
      <label htmlFor="new-password" className="block pt-1 text-[13px] font-semibold">Password <span className="font-normal text-text-subtle">(at least 8 characters)</span></label>
      <PasswordInput id="new-password" value={pw} onChange={(v) => { setPw(v); setErr(null); }} autoComplete="new-password" invalid={!!err} />
      <label htmlFor="confirm-password" className="block text-[13px] font-semibold">Confirm password</label>
      <PasswordInput id="confirm-password" value={pw2} onChange={(v) => { setPw2(v); setErr(null); }} autoComplete="new-password" invalid={!!err && pw !== pw2} />
      {err && <p role="alert" className="flex items-start gap-1.5 text-[13px] font-medium text-danger"><AlertCircle className="mt-px size-4 shrink-0" aria-hidden />{err}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save and continue</Button>
      <button type="button" onClick={onDone} className="w-full py-2 text-center text-body-sm font-semibold text-text-muted underline underline-offset-2">Skip for now</button>
    </form>
  );
}
