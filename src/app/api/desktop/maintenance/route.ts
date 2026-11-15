import { timingSafeEqual } from "node:crypto";
import { isDesktop } from "@/server/desktop";
import { purgeDueHouseholds } from "@/server/privacy/service";

export const dynamic = "force-dynamic";

/**
 * Desktop edition only: the shell calls this at startup (daily privacy purge), authenticated
 * by a random per-launch token it passed to this process. Not reachable on the server edition.
 */
export async function POST(req: Request) {
  const expected = process.env.TA_DESKTOP_TOKEN ?? "";
  const got = req.headers.get("x-ta-desktop-token") ?? "";
  const ok = isDesktop() && expected.length >= 32 && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  if (!ok) return new Response("Not found", { status: 404 });
  const r = await purgeDueHouseholds();
  return Response.json({ retentionYears: r.retentionYears, restricted: r.restricted, purged: r.purged.length });
}
