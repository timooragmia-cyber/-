import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/server/env";

// Single PrismaClient per process (hot-reload safe in development).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  globalForPrisma.prisma ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: env().DATABASE_URL }) });
  return globalForPrisma.prisma;
}

/**
 * Created on first use, not at import: `next build` imports route modules to collect page
 * data, and the build must not need DATABASE_URL or any secret (the image is built without them).
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c) as unknown;
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(c) : value;
  },
});
