import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px] [&_svg]:stroke-[1.75]",
  {
    variants: {
      variant: {
        // Primary: navy on light grounds (gold in dark mode via tokens). One per screen.
        default: "bg-primary text-on-primary hover:bg-primary-hover",
        // On a navy brand panel: the one gold button.
        brand: "bg-accent text-on-accent font-bold hover:bg-accent-hover",
        destructive: "bg-danger text-white hover:opacity-90",
        // Secondary
        outline: "border border-line-control bg-surface text-text hover:bg-surface-raised",
        secondary: "bg-surface-raised text-text hover:bg-line",
        // On-brand secondary
        "brand-outline": "border border-brand-line bg-transparent text-on-brand hover:bg-brand-raised",
        // Ghost: "Cancel", "Not interested", toolbar actions
        ghost: "text-text-muted hover:bg-surface-raised hover:text-text",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 text-[15px] leading-[22px] has-[>svg]:px-4",
        xs: "h-7 gap-1 rounded-sm px-2 text-[12px] has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 gap-1.5 px-3.5 text-[13px] has-[>svg]:px-3 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-12 px-6 text-[15px] has-[>svg]:px-5",
        icon: "size-10",
        "icon-xs": "size-7 rounded-sm [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
