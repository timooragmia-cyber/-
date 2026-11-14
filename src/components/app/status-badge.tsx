import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import type { MonthStatus, Trend } from "@/lib/domain/household-status";

export async function StatusBadge({ status }: { status: MonthStatus }) {
  const t = await getTranslations("status");
  const tone = status === "SURPLUS" ? "ok" : status === "DEFICIT" ? "bad" : "neutral";
  const icon = status === "SURPLUS" ? "●" : status === "DEFICIT" ? "▲" : "○";
  return (
    <Badge tone={tone}>
      <span aria-hidden>{icon}</span>
      {t(status)}
    </Badge>
  );
}

export function TrendArrow({ trend }: { trend: Trend }) {
  if (!trend) return <span className="text-muted">—</span>;
  const map = { UP: { s: "↑", c: "text-ok", l: "improving" }, DOWN: { s: "↓", c: "text-bad", l: "worsening" }, FLAT: { s: "→", c: "text-muted", l: "flat" } } as const;
  const m = map[trend];
  return (
    <span className={`text-lg font-bold ${m.c}`} aria-label={m.l} title={m.l}>
      {m.s}
    </span>
  );
}
