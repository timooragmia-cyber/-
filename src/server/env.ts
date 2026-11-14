import "server-only";
import { z } from "zod";

/**
 * All secrets come from the environment. Nothing secret is committed.
 * Validated once at startup; the app refuses to boot with weak/missing values.
 */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // 32 random bytes, base64. Key id prefix allows rotation: "v1:<base64>,v2:<base64>"; last = active.
  FIELD_ENCRYPTION_KEYS: z.string().min(10),
  // Separate 32-byte key for HMAC blind indexes (lookup of encrypted identifiers).
  BLIND_INDEX_KEY: z.string().min(40),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(72).default(12),
  APP_URL: z.string().url().default("http://localhost:3000"),
  TOTP_ISSUER: z.string().default("T.A Mortgages"),
  UPLOAD_DIR: z.string().default("./storage/uploads"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        "Invalid environment configuration: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    cached = parsed.data;
  }
  return cached;
}
