import "server-only";
import { env } from "@/server/env";
import { blindIndex, decryptBuffer, decryptField, encryptBuffer, encryptField, parseKeyRing, type KeyRing } from "./field-encryption";

let ring: KeyRing | undefined;
const getRing = () => (ring ??= parseKeyRing(env().FIELD_ENCRYPTION_KEYS));

export const encrypt = (plaintext: string, aad = "") => encryptField(plaintext, getRing(), aad);
export const decrypt = (payload: string, aad = "") => decryptField(payload, getRing(), aad);
export const lookupIndex = (value: string, namespace: string) =>
  blindIndex(value, Buffer.from(env().BLIND_INDEX_KEY, "base64"), namespace);
export const encryptBytes = (plain: Buffer, aad: string) => encryptBuffer(plain, getRing(), aad);
export const decryptBytes = (blob: Buffer, aad: string) => decryptBuffer(blob, getRing(), aad);
