/**
 * At-rest sealing for the one secret the database keeps: a runner's Garmin API key.
 *
 * AES-256-GCM with a fresh 96-bit nonce per value. The stored form is self-describing, `enc:v1:<iv>:<tag>:<data>`, so a
 * value can be told apart from legacy plaintext without a schema flag, and a wrong key fails the authentication tag
 * instead of returning garbage.
 *
 * The key comes from the deployment (`MILEBOOK_GARMIN_KEY`, 32 bytes base64). Without it the store keeps today's
 * behaviour and the boot log warns; with it, new keys are sealed and every legacy plaintext row is sealed on boot.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const SEALED_PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface SecretBox {
  /** Always true; present so a caller can branch on "a box was configured" without a nullable check. */
  readonly sealed: true;
  /** Seal one UTF-8 string. */
  seal(plain: string): string;
  /** Open a sealed string, or undefined when it is not sealed by this key. Never throws. */
  open(value: string): string | undefined;
}

/** True for a value this module produced; false for legacy plaintext. */
export function isSealedSecret(value: string): boolean {
  return value.startsWith(SEALED_PREFIX);
}

/** Parse `MILEBOOK_GARMIN_KEY`; throws a message that names the variable, because a boot failure is where it surfaces. */
export function parseSecretKey(raw: string): Buffer {
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(`MILEBOOK_GARMIN_KEY must be ${KEY_BYTES} bytes base64-encoded (got ${key.length} bytes)`);
  }
  return key;
}

export function createSecretBox(key: Buffer): SecretBox {
  if (key.length !== KEY_BYTES) {
    throw new Error(`secret box key must be ${KEY_BYTES} bytes (got ${key.length})`);
  }
  return {
    sealed: true,
    seal(plain: string): string {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${SEALED_PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${data.toString("base64url")}`;
    },
    open(value: string): string | undefined {
      if (!isSealedSecret(value)) return undefined;
      const parts = value.slice(SEALED_PREFIX.length).split(":");
      if (parts.length !== 3) return undefined;
      const [ivPart, tagPart, dataPart] = parts;
      if (ivPart === undefined || tagPart === undefined || dataPart === undefined) return undefined;
      try {
        const iv = Buffer.from(ivPart, "base64url");
        const tag = Buffer.from(tagPart, "base64url");
        const data = Buffer.from(dataPart, "base64url");
        if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return undefined;
        const decipher = createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
      } catch {
        return undefined;
      }
    },
  };
}
