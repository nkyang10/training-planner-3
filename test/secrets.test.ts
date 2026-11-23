import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createSecretBox, isSealedSecret, parseSecretKey } from "../src/secrets";

const key = (): Buffer => randomBytes(32);

describe("secret box", () => {
  it("round-trips a value and produces a self-describing sealed form", () => {
    const box = createSecretBox(key());
    const sealed = box.seal("garmin-api-key-value");

    expect(sealed.startsWith("enc:v1:")).toBe(true);
    expect(sealed).not.toContain("garmin-api-key-value");
    expect(isSealedSecret(sealed)).toBe(true);
    expect(box.open(sealed)).toBe("garmin-api-key-value");
  });

  it("uses a fresh nonce so the same plaintext seals differently", () => {
    const box = createSecretBox(key());
    expect(box.seal("same")).not.toBe(box.seal("same"));
  });

  it("returns undefined for a wrong key instead of throwing", () => {
    const sealed = createSecretBox(key()).seal("secret");
    expect(createSecretBox(key()).open(sealed)).toBeUndefined();
  });

  it("returns undefined for tampered data", () => {
    const box = createSecretBox(key());
    const sealed = box.seal("secret");
    const parts = sealed.split(":");
    const data = Buffer.from(parts[3] ?? "", "base64url");
    data[0] = (data[0] ?? 0) ^ 0xff;
    parts[3] = data.toString("base64url");
    expect(box.open(parts.join(":"))).toBeUndefined();
  });

  it("does not open plaintext or malformed values", () => {
    const box = createSecretBox(key());
    expect(box.open("plain-key")).toBeUndefined();
    expect(box.open("enc:v1:only:two")).toBeUndefined();
    expect(box.open("enc:v1:not-base64!:x:y")).toBeUndefined();
    expect(isSealedSecret("plain-key")).toBe(false);
  });

  it("parses a base64 key and rejects the wrong length", () => {
    const raw = randomBytes(32).toString("base64");
    expect(parseSecretKey(raw).length).toBe(32);
    expect(() => parseSecretKey(randomBytes(16).toString("base64"))).toThrow(/MILEBOOK_GARMIN_KEY must be 32 bytes/);
    expect(() => createSecretBox(randomBytes(8))).toThrow(/secret box key must be 32 bytes/);
  });
});
