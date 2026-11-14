import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { blindIndex, decryptField, encryptField, parseKeyRing } from "@/server/crypto/field-encryption";

const k = () => randomBytes(32).toString("base64");

describe("field encryption", () => {
  const ring = parseKeyRing(`v1:${k()}`);

  it("roundtrips and is non-deterministic", () => {
    const a = encryptField("012345678", ring);
    const b = encryptField("012345678", ring);
    expect(a).not.toBe(b);
    expect(decryptField(a, ring)).toBe("012345678");
  });

  it("detects tampering", () => {
    const enc = encryptField("secret", ring).split(".");
    enc[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptField(enc.join("."), ring)).toThrow();
  });

  it("binds associated data (cannot move ciphertext between users)", () => {
    const enc = encryptField("secret", ring, "totp:user1");
    expect(() => decryptField(enc, ring, "totp:user2")).toThrow();
    expect(decryptField(enc, ring, "totp:user1")).toBe("secret");
  });

  it("supports key rotation: old key decrypts, new key encrypts", () => {
    const v1 = k();
    const old = parseKeyRing(`v1:${v1}`);
    const rotated = parseKeyRing(`v1:${v1},v2:${k()}`);
    const legacy = encryptField("x", old);
    expect(decryptField(legacy, rotated)).toBe("x");
    expect(encryptField("x", rotated).startsWith("v2.")).toBe(true);
  });

  it("rejects bad keys", () => {
    expect(() => parseKeyRing("v1:short")).toThrow();
    expect(() => parseKeyRing("")).toThrow();
  });

  it("blind index is deterministic and namespaced", () => {
    const key = randomBytes(32);
    expect(blindIndex("123", key, "nid")).toBe(blindIndex("123", key, "nid"));
    expect(blindIndex("123", key, "nid")).not.toBe(blindIndex("123", key, "phone"));
  });
});
