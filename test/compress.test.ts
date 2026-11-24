import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";

import { acceptsGzip, encodeBody, encodedValidator, isCompressibleType } from "../src/compress";

const big = "body { color: #333; }\n".repeat(200);

describe("compression", () => {
  it("treats only textual content types as compressible", () => {
    expect(isCompressibleType("text/html; charset=utf-8")).toBe(true);
    expect(isCompressibleType("text/css")).toBe(true);
    expect(isCompressibleType("application/javascript")).toBe(true);
    expect(isCompressibleType("application/json; charset=utf-8")).toBe(true);
    expect(isCompressibleType("image/svg+xml")).toBe(true);
    expect(isCompressibleType("model/gltf-binary")).toBe(false);
    expect(isCompressibleType("image/webp")).toBe(false);
  });

  it("parses accept-encoding, including refusals", () => {
    expect(acceptsGzip("gzip")).toBe(true);
    expect(acceptsGzip("deflate, gzip;q=0.8, br")).toBe(true);
    expect(acceptsGzip("*")).toBe(true);
    expect(acceptsGzip("*, gzip;q=0")).toBe(false);
    expect(acceptsGzip("gzip;q=0, *")).toBe(false);
    expect(acceptsGzip("br, *;q=0.5")).toBe(true);
    expect(acceptsGzip("gzip;q=0")).toBe(false);
    expect(acceptsGzip("identity")).toBe(false);
    expect(acceptsGzip("br, deflate")).toBe(false);
    expect(acceptsGzip(undefined)).toBe(false);
    expect(acceptsGzip("")).toBe(false);
    expect(acceptsGzip(["br", "gzip"])).toBe(true);
  });

  it("compresses a large textual body and round-trips it", () => {
    const encoded = encodeBody({ body: big, contentType: "text/css", acceptEncoding: "gzip" });
    expect(encoded.encoding).toBe("gzip");
    expect(encoded.body.length).toBeLessThan(Buffer.byteLength(big));
    expect(encoded.body.equals(gzipSync(Buffer.from(big, "utf8"), { level: 6 }))).toBe(true);
  });

  it("leaves small bodies, binary types and refusing clients alone", () => {
    expect(encodeBody({ body: "tiny", contentType: "text/css", acceptEncoding: "gzip" }).encoding).toBeUndefined();
    expect(encodeBody({ body: big, contentType: "model/gltf-binary", acceptEncoding: "gzip" }).encoding).toBeUndefined();
    expect(encodeBody({ body: big, contentType: "text/css", acceptEncoding: "identity" }).encoding).toBeUndefined();
    expect(encodeBody({ body: big, contentType: "text/css", acceptEncoding: undefined }).encoding).toBeUndefined();
  });

  it("caches a static asset by its validator", () => {
    const first = encodeBody({ body: big, contentType: "text/css", acceptEncoding: "gzip", cacheKey: "css-v1" });
    const second = encodeBody({ body: big, contentType: "text/css", acceptEncoding: "gzip", cacheKey: "css-v1" });
    expect(second.body).toBe(first.body);
    const changed = encodeBody({ body: `${big}/* v2 */`, contentType: "text/css", acceptEncoding: "gzip", cacheKey: "css-v2" });
    expect(changed.body).not.toBe(first.body);
  });

  it("names the gzip variant inside the quotes so it stays a valid ETag", () => {
    expect(encodedValidator('"abc"', "gzip")).toBe('"abc-gzip"');
    expect(encodedValidator('"abc"', undefined)).toBe('"abc"');
    expect(encodedValidator("abc", "gzip")).toBe("abc-gzip");
  });
});
