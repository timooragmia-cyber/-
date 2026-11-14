"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Tabs({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="sections" className="-mx-4 overflow-x-auto border-b border-border px-4">
      <ul className="flex min-w-max gap-1">
        {items.map((i) => {
          const active = i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`block border-b-2 px-3 py-2 text-sm whitespace-nowrap ${active ? "border-brand font-semibold text-brand" : "border-transparent text-muted hover:text-foreground"}`}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
