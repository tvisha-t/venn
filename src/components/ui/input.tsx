import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-md border border-line-control bg-surface px-4 text-[15px] text-text transition-colors outline-none placeholder:text-text-subtle disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-primary",
        "aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
