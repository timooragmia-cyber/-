import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export const Th = ({ className, ...p }: ComponentProps<"th">) => (
  <th className={cn("border-b border-border px-3 py-2 text-start font-medium text-muted", className)} {...p} />
);
export const Td = ({ className, ...p }: ComponentProps<"td">) => (
  <td className={cn("border-b border-border px-3 py-2 align-top", className)} {...p} />
);
