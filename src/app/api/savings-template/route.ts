import { requireAdvisor } from "@/server/auth/dal";
import { buildTemplate } from "@/server/savings/report-parsers";

export const dynamic = "force-dynamic";

/** Empty XLSX template for long-term savings products (advisor only). */
export async function GET() {
  await requireAdvisor();
  const bytes = await buildTemplate();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="ta-savings-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
