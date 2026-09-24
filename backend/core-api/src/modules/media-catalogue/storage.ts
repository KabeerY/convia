import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CoreConfig } from "../../config.js";
import { DomainError } from "../../domain.js";

let cached: SupabaseClient | null = null;

export function serviceStorage(config: CoreConfig): SupabaseClient {
  if (!config.SUPABASE_URL || !config.SUPABASE_SECRET_KEY)
    throw new DomainError("STORAGE_NOT_CONFIGURED", 503);
  if (!cached)
    cached = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  return cached;
}

export function extFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

/** Decodes base64, enforces size/type, returns bytes + sha256 + sniffed type. */
export function decodeUpload(
  imageBase64: string,
  declaredType: string,
  maxBytes: number,
): { bytes: Buffer; contentType: string; checksum: string } {
  const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
  if (!allowed.has(declaredType))
    throw new DomainError("UNSUPPORTED_IMAGE_TYPE", 422);
  let bytes: Buffer;
  try {
    bytes = Buffer.from(imageBase64, "base64");
  } catch {
    throw new DomainError("INVALID_IMAGE", 422);
  }
  if (bytes.length === 0 || bytes.length > maxBytes)
    throw new DomainError("INVALID_IMAGE_SIZE", 413);
  // Magic-byte sniff: never trust the declared type alone.
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isWebp =
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";
  const sniffed = isJpeg
    ? "image/jpeg"
    : isPng
      ? "image/png"
      : isWebp
        ? "image/webp"
        : null;
  if (!sniffed) throw new DomainError("INVALID_IMAGE", 422);
  return {
    bytes,
    contentType: sniffed,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  };
}
