import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateRecoveryCodes, generateTotpSecret, hotp, otpauthUri, totp, verifyTotp } from "@/server/auth/totp";

// RFC 6238 Appendix B test vectors (SHA-1 seed "12345678901234567890", 8 digits).
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const vectors: [number, string][] = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

describe("TOTP (RFC 6238)", () => {
  it.each(vectors)("t=%s → %s", (t, expected) => {
    expect(hotp(RFC_SECRET, BigInt(Math.floor(t / 30)), 8)).toBe(expected);
  });

  it("RFC 4226 HOTP vectors (counter 0..2)", () => {
    expect([0n, 1n, 2n].map((c) => hotp(RFC_SECRET, c))).toEqual(["755224", "287082", "359152"]);
  });

  it("base32 roundtrip", () => {
    const b = Buffer.from("hello world, 12345");
    expect(base32Decode(base32Encode(b)).equals(b)).toBe(true);
    expect(base32Encode(RFC_SECRET)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  });

  it("verifies current code with ±1 step drift and rejects others", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totp(secret, now), now)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 30_000), now)).not.toBeNull();
    expect(verifyTotp(secret, totp(secret, now - 90_000), now)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
    expect(verifyTotp(secret, "abcdef", now)).toBeNull();
  });

  it("returns increasing counters for replay protection", () => {
    const secret = generateTotpSecret();
    const a = verifyTotp(secret, totp(secret, 1_700_000_000_000), 1_700_000_000_000)!;
    const b = verifyTotp(secret, totp(secret, 1_700_000_030_000), 1_700_000_030_000)!;
    expect(b).toBe(a + 1n);
  });

  it("builds an otpauth URI and unique recovery codes", () => {
    expect(otpauthUri("ABC", "a@example.test", "T.A Mortgages")).toMatch(/^otpauth:\/\/totp\/T\.A%20Mortgages%3Aa%40example\.test\?secret=ABC/);
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    codes.forEach((c) => expect(c).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/));
  });
});
