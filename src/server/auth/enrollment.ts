import "server-only";
import { decrypt, encrypt } from "@/server/crypto";
import { db } from "@/server/db";
import { generateTotpSecret } from "./totp";

/**
 * Creates (or returns) the pending TOTP secret for a user who has not enrolled yet.
 * Server-only (NOT a server action): callers must already hold the user's partial session.
 */
export async function getOrCreatePendingTotpSecret(userId: string): Promise<string> {
  const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (row.totpEnabledAt) throw new Error("2FA already enrolled");
  if (row.totpSecretEnc) return decrypt(row.totpSecretEnc, `totp:${userId}`);
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: userId }, data: { totpSecretEnc: encrypt(secret, `totp:${userId}`) } });
  return secret;
}
