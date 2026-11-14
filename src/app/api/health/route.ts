import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness/readiness for Docker healthcheck. Exposes no data. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
