import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Field-level encryption for sensitive identifiers (national ID, TOTP secrets).
 * AES-256-GCM, random 96-bit IV, format: "<keyId>.<iv>.<tag>.<ciphertext>" (base64url parts).
 * Keys: "v1:<base64 32 bytes>,v2:<base64 32 bytes>" — the LAST key encrypts, all keys decrypt.
 *
 * Pure module (keys passed in) so it is unit-testable without env.
 */

export type KeyRing = { activeId: string; keys: Map<string, Buffer> };

export function parseKeyRing(spec: string): KeyRing {
  const keys = new Map<string, Buffer>();
  let activeId = "";
  for (const part of spec.split(",").map((p) => p.trim()).filter(Boolean)) {
    const idx = part.indexOf(":");
    if (idx <= 0) throw new Error("Invalid key ring entry (expected id:base64)");
    const id = part.slice(0, idx);
    const key = Buffer.from(part.slice(idx + 1), "base64");
    if (key.length !== 32) throw new Error(`Key ${id} must be 32 bytes`);
    if (!/^[a-z0-9]+$/i.test(id)) throw new Error(`Invalid key id ${id}`);
    keys.set(id, key);
    activeId = id;
  }
  if (!activeId) throw new Error("Empty key ring");
  return { activeId, keys };
}

export function encryptField(plaintext: string, ring: KeyRing, aad = ""): string {
  const key = ring.keys.get(ring.activeId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ring.activeId, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptField(payload: string, ring: KeyRing, aad = ""): string {
  const [id, ivB, tagB, ctB] = payload.split(".");
  if (!id || !ivB || !tagB || ctB === undefined) throw new Error("Malformed encrypted field");
  const key = ring.keys.get(id);
  if (!key) throw new Error(`Unknown encryption key id ${id}`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64url"));
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64url")), decipher.final()]).toString("utf8");
}

/** Deterministic HMAC-SHA256 for exact-match lookup of encrypted values. */
export function blindIndex(value: string, key: Buffer, namespace: string): string {
  return createHmac("sha256", key).update(`${namespace}\u0000${value}`).digest("base64url");
}

/** Binary variant for files: [keyIdLen(1)][keyId][iv(12)][tag(16)][ciphertext]. */
export function encryptBuffer(plain: Buffer, ring: KeyRing, aad: string): Buffer {
  const key = ring.keys.get(ring.activeId)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const id = Buffer.from(ring.activeId, "utf8");
  return Buffer.concat([Buffer.from([id.length]), id, iv, cipher.getAuthTag(), ct]);
}

export function decryptBuffer(blob: Buffer, ring: KeyRing, aad: string): Buffer {
  const idLen = blob.readUInt8(0);
  const id = blob.subarray(1, 1 + idLen).toString("utf8");
  const key = ring.keys.get(id);
  if (!key) throw new Error(`Unknown encryption key id ${id}`);
  const iv = blob.subarray(1 + idLen, 13 + idLen);
  const tag = blob.subarray(13 + idLen, 29 + idLen);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(29 + idLen)), decipher.final()]);
}
