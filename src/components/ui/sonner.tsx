"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = (props: ToasterProps) => (
  <Sonner
    theme="system"
    className="toaster group"
    toastOptions={{ classNames: { toast: "!bg-surface !text-text !border-line !shadow-pop !rounded-md" } }}
    {...props}
  />
)

export { Toaster }
