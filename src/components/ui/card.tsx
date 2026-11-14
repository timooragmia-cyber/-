import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("mb-3 text-lg font-semibold", className)} {...props} />;
}
