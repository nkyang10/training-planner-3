/**
 * Response compression, kept deliberately small.
 *
 * Only textual bodies are gzipped: HTML, CSS, JavaScript and JSON. Images and the anatomy model are already compressed
 * containers, so gzipping them burns CPU for a few percent and doubles the memory the process holds.
 *
 * A static asset is compressed once and cached under its validator, because the bytes never change while the process
 * runs. A rendered page is compressed per response — the bytes differ per runner and per flash message — which costs a
 * millisecond or two on a page that was going to spend far longer in SQLite anyway.
 */
import { gzipSync } from "node:zlib";

/** Below this, the gzip header and trailer cost more than the compression saves. */
const MIN_COMPRESSIBLE_BYTES = 1024;

/** Static assets are few; a cap keeps a future large asset from pinning memory forever. */
const CACHE_LIMIT = 16;

const TEXTUAL_CONTENT_TYPE =
  /^(?:text\/|application\/(?:javascript|json|xml|manifest\+json)|image\/svg\+xml)/i;

const compressedAssets = new Map<string, Buffer>();

export function isCompressibleType(contentType: string): boolean {
  return TEXTUAL_CONTENT_TYPE.test(contentType);
}

/**
 * Whether the client accepts gzip. `gzip;q=0` and `identity` are treated as refusals, and `*` as acceptance; a header the
 * caller cannot parse is a refusal, because sending an encoding the client did not ask for breaks it. An explicit `gzip`
 * entry outranks `*` in either order: `*, gzip;q=0` is a refusal, not an acceptance.
 */
export function acceptsGzip(header: string | string[] | undefined): boolean {
  const raw = Array.isArray(header) ? header.join(",") : header;
  if (raw === undefined || raw.trim() === "") return false;
  let starWeight: number | undefined;
  let gzipWeight: number | undefined;
  for (const part of raw.split(",")) {
    const [tokenRaw, ...parameters] = part.split(";");
    const token = (tokenRaw ?? "").trim().toLowerCase();
    if (token !== "gzip" && token !== "*") continue;
    const weightParameter = parameters.map((parameter) => parameter.trim()).find((parameter) => /^q=/i.test(parameter));
    const weight = weightParameter === undefined ? 1 : Number(weightParameter.slice(2));
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) continue;
    if (token === "gzip") gzipWeight = weight;
    else starWeight = weight;
  }
  // The specific entry is authoritative; `*` is only a fallback when the header never names gzip.
  const chosen = gzipWeight ?? starWeight;
  return chosen !== undefined && chosen > 0;
}

export interface EncodedBody {
  readonly body: Buffer;
  /** `"gzip"` when the body was compressed, `undefined` when it is sent as-is. */
  readonly encoding?: "gzip";
}

export interface EncodeOptions {
  readonly body: string | Buffer;
  readonly contentType: string;
  readonly acceptEncoding: string | string[] | undefined;
  /** Stable validator for a static asset; omitted for a rendered page, which is compressed per response. */
  readonly cacheKey?: string;
}

export function encodeBody(options: EncodeOptions): EncodedBody {
  const plain = typeof options.body === "string" ? Buffer.from(options.body, "utf8") : options.body;
  if (
    plain.length < MIN_COMPRESSIBLE_BYTES ||
    !isCompressibleType(options.contentType) ||
    !acceptsGzip(options.acceptEncoding)
  ) {
    return { body: plain };
  }

  if (options.cacheKey !== undefined) {
    const cached = compressedAssets.get(options.cacheKey);
    if (cached !== undefined) return { body: cached, encoding: "gzip" };
  }

  const compressed = gzipSync(plain, { level: 6 });

  if (options.cacheKey !== undefined) {
    compressedAssets.set(options.cacheKey, compressed);
    if (compressedAssets.size > CACHE_LIMIT) {
      const oldest = compressedAssets.keys().next().value;
      if (oldest !== undefined) compressedAssets.delete(oldest);
    }
  }

  return { body: compressed, encoding: "gzip" };
}

/**
 * The validator a compressed response must carry, so a revalidating client matches the variant it actually holds. The
 * suffix goes inside the quotes: an ETag is one quoted string, and `"abc"-gzip` is not a valid one.
 */
export function encodedValidator(etag: string, encoding: "gzip" | undefined): string {
  if (encoding !== "gzip") return etag;
  return etag.endsWith('"') ? `${etag.slice(0, -1)}-gzip"` : `${etag}-gzip`;
}
