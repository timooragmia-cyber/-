import { getCurrentUserOrNull, HouseholdRestrictedError } from "@/server/auth/dal";
import { ForbiddenError } from "@/server/auth/dal-guards";
import { readReport } from "@/server/reports/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUserOrNull();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  try {
    const r = await readReport(user, id);
    if (!r) return new Response("Not found", { status: 404 });
    const name = `ta-report-${r.report.type.toLowerCase()}-${r.report.period ?? r.report.createdAt.toISOString().slice(0, 10)}.pdf`;
    return new Response(Buffer.from(r.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof HouseholdRestrictedError) return new Response("Not found", { status: 404 });
    throw e;
  }
}
