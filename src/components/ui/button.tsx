import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 min-h-10 px-4",
  {
    variants: {
      variant: {
        default: "bg-brand text-brand-foreground hover:bg-brand/90",
        outline: "border border-border bg-surface hover:bg-background",
        ghost: "hover:bg-background",
        danger: "bg-bad text-white hover:bg-bad/90",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Button({ className, variant, ...props }: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}

export { buttonVariants };
