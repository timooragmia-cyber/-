import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { decryptBytes, encryptBytes } from "@/server/crypto";
import { env } from "@/server/env";

/**
 * Uploaded client files are encrypted at rest (AES-256-GCM, same key ring as field encryption).
 * Storage keys are random and never derived from user input (no path traversal).
 */
const root = () => path.resolve(env().UPLOAD_DIR);

function resolveKey(key: string): string {
  if (!/^[a-z0-9]{2}\/[a-z0-9]{40}\.bin$/.test(key)) throw new Error("Invalid storage key");
  return path.join(root(), key);
}

export async function storeEncrypted(bytes: Uint8Array): Promise<{ storageKey: string; sha256: string }> {
  const id = randomBytes(20).toString("hex");
  const storageKey = `${id.slice(0, 2)}/${id}.bin`;
  const full = resolveKey(storageKey);
  await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  await writeFile(full, encryptBytes(Buffer.from(bytes), storageKey), { mode: 0o600 });
  return { storageKey, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function readDecrypted(storageKey: string): Promise<Uint8Array> {
  return new Uint8Array(decryptBytes(await readFile(resolveKey(storageKey)), storageKey));
}

export async function deleteStored(storageKey: string): Promise<void> {
  await rm(resolveKey(storageKey), { force: true });
}
