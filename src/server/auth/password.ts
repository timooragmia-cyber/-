import { hash, verify } from "@node-rs/argon2";

// Argon2id, OWASP-recommended parameters (m=19 MiB, t=2, p=1).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const MIN_PASSWORD_LENGTH = 12;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** Basic policy: length-first (NIST SP 800-63B), no composition rules. */
export function passwordPolicyError(password: string): "too_short" | "too_long" | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "too_short";
  if (password.length > 256) return "too_long";
  return null;
}
