import { getCurrentUserOrNull, HouseholdRestrictedError } from "@/server/auth/dal";
import { ForbiddenError } from "@/server/auth/dal-guards";
import { exportHousehold } from "@/server/privacy/service";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Right of access: ZIP of the household's data.
 * Client → always their own household (the query parameter is ignored). Advisor → ?household=.
 */
export async function GET(req: Request) {
  const user = await getCurrentUserOrNull();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const householdId = user.role === "CLIENT" ? user.householdId : new URL(req.url).searchParams.get("household");
  if (!householdId || !/^[a-z0-9]{20,40}$/.test(householdId)) return new Response("Not found", { status: 404 });
  // Exports are heavy and sensitive: a few per hour per user is plenty.
  if (!rateLimit(`export:${user.id}`, user.role === "CLIENT" ? 5 : 30, 60 * 60_000).ok) return new Response("Too many requests", { status: 429 });
  try {
    const { filename, bytes } = await exportHousehold(user, householdId);
    return new Response(Buffer.from(bytes), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof HouseholdRestrictedError) return new Response("Not found", { status: 404 });
    throw e;
  }
}
