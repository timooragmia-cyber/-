import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP (HMAC-SHA1, 30 s, 6 digits) — compatible with Google Authenticator,
 * Microsoft Authenticator, 1Password, etc. Implemented on node:crypto (no dependency)
 * and verified against the RFC 6238 test vectors in tests/unit/totp.test.ts.
 */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const s = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of s) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: bigint, digits = 6, algorithm: "sha1" | "sha256" | "sha512" = "sha1"): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter);
  const h = createHmac(algorithm, secret).update(msg).digest();
  const offset = h.readUInt8(h.length - 1) & 0x0f;
  const bin = h.readUInt32BE(offset) & 0x7fffffff;
  return (bin % 10 ** digits).toString().padStart(digits, "0");
}

export function totp(secretB32: string, atMs: number, step = 30, digits = 6): string {
  return hotp(base32Decode(secretB32), BigInt(Math.floor(atMs / 1000 / step)), digits);
}

/**
 * Verify with ±1 step tolerance for clock drift. Returns the matched counter so the
 * caller can reject replays (counter must be > last used counter).
 */
export function verifyTotp(secretB32: string, code: string, atMs: number, window = 1, step = 30): bigint | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretB32);
  const current = BigInt(Math.floor(atMs / 1000 / step));
  for (let i = -window; i <= window; i++) {
    const counter = current + BigInt(i);
    const expected = hotp(secret, counter);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return counter;
  }
  return null;
}

export function otpauthUri(secretB32: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretB32, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(8)).slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}
