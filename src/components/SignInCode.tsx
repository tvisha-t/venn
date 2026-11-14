"use client";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, MailCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, "0")}`;

/** Step 2 of school-email sign-in: six single-digit boxes, paste-to-fill, auto-submit on the 6th digit. */
export function SignInCode({ email, expiresIn, resendIn, onBack, onDone }: {
  email: string; expiresIn: number; resendIn: number; onBack: () => void; onDone: (next: string) => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expiry, setExpiry] = useState(expiresIn);
  const [cooldown, setCooldown] = useState(resendIn);
  const [resent, setResent] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { boxes.current[0]?.focus(); }, []);
  useEffect(() => {
    const t = setInterval(() => { setExpiry((x) => Math.max(0, x - 1)); setCooldown((x) => Math.max(0, x - 1)); }, 1000);
    return () => clearInterval(t);
  }, []);

  async function submit(code: string) {
    if (busy || code.length !== 6) return;
    setBusy(true); setErr(null);
    try {
      const r = await api<{ next: string }>("/api/auth/verify-code", { method: "POST", json: { email, code } });
      onDone(r.next);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
      setDigits(Array(6).fill(""));
      setTimeout(() => boxes.current[0]?.focus(), 0);
    }
  }

  function setFrom(i: number, raw: string) {
    const v = raw.replace(/\D/g, "");
    if (!v) { const d = [...digits]; d[i] = ""; setDigits(d); return; }
    const d = [...digits];
    for (let k = 0; k < v.length && i + k < 6; k++) d[i + k] = v[k];
    setDigits(d);
    const nextIdx = Math.min(5, i + v.length);
    boxes.current[nextIdx]?.focus();
    if (d.every(Boolean)) submit(d.join(""));
  }

  async function resend() {
    setErr(null); setResent(false);
    try {
      const r = await api<{ expiresIn: number; resendIn: number }>("/api/auth/request-code", { method: "POST", json: { email } });
      setExpiry(r.expiresIn); setCooldown(r.resendIn); setResent(true); setDigits(Array(6).fill(""));
      boxes.current[0]?.focus();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code?.startsWith("cooldown:")) setCooldown(Number(code.split(":")[1]) || 60);
      setErr((e as Error).message);
    }
  }

  return (
    <div>
      <span className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary-ink"><MailCheck className="size-5" aria-hidden /></span>
      <h2 className="mt-4 text-title-2">Check your email</h2>
      <p className="mt-1 text-text-muted">We sent a 6-digit code to <strong className="font-semibold text-text">{email}</strong>.</p>

      <fieldset className="mt-6" aria-describedby={err ? "code-err" : "code-help"}>
        <legend className="mb-2 text-[13px] font-semibold">Sign-in code</legend>
        <div className="flex gap-2" onPaste={(e) => { e.preventDefault(); setFrom(0, e.clipboardData.getData("text")); }}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { boxes.current[i] = el; }}
              value={d}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={i === 0 ? 6 : 1}
              autoComplete={i === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${i + 1}`}
              aria-invalid={!!err}
              disabled={busy}
              onChange={(e) => setFrom(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
                if (e.key === "ArrowLeft" && i > 0) boxes.current[i - 1]?.focus();
                if (e.key === "ArrowRight" && i < 5) boxes.current[i + 1]?.focus();
                if (e.key === "Enter") submit(digits.join(""));
              }}
              className={cn(
                "h-14 w-full min-w-0 rounded-md border bg-surface text-center font-mono text-[24px] text-text outline-none transition-colors focus:border-primary",
                err ? "border-2 border-danger" : "border-line-control",
              )}
            />
          ))}
        </div>
      </fieldset>

      {err && <p id="code-err" role="alert" className="mt-2 flex items-start gap-1.5 text-[13px] font-medium text-danger"><AlertCircle className="mt-px size-4 shrink-0" aria-hidden />{err}</p>}
      {resent && !err && <p role="status" className="mt-2 text-[13px] font-medium text-success">New code sent.</p>}

      <Button size="lg" className="mt-4 w-full" disabled={busy || digits.some((d) => !d)} onClick={() => submit(digits.join(""))}>
        {busy && <Loader2 className="animate-spin" />} {busy ? "Checking…" : "Verify"}
      </Button>

      <div id="code-help" className="mt-4 space-y-2 text-body-sm text-text-muted">
        <p className="flex items-center justify-between gap-2">
          <span>{expiry > 0 ? <>Code expires in <span className="font-mono">{fmt(expiry)}</span></> : "This code expired."}</span>
          {cooldown > 0
            ? <span>Resend in <span className="font-mono">{fmt(cooldown)}</span></span>
            : <button type="button" onClick={resend} className="font-semibold text-link underline underline-offset-2">Resend code</button>}
        </p>
        <p>Not there? Check Outlook&apos;s Other tab or Junk.</p>
        <p>Wrong email? <button type="button" onClick={onBack} className="font-semibold text-link underline underline-offset-2">Change it</button></p>
      </div>
    </div>
  );
}
