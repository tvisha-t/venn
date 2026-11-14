"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="light"
    className="toaster group"
    toastOptions={{ classNames: { toast: "!bg-white !text-[var(--gt-brand)] !border-[var(--gt-pi-mile)]" } }}
    {...props}
  />
)

export { Toaster }
