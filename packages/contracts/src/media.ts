/**
 * M03-B1 media-gateway request contract. The browser supplies only an asset
 * ID, the asset version it expects, and an optional approved variant — never
 * a Drive file ID. See `MediaErrorCode` in `api-error.ts` for the sanitized
 * error codes this endpoint returns.
 */
export const MEDIA_VARIANTS = ['default', 'mobile', 'poster'] as const;
export type MediaVariant = (typeof MEDIA_VARIANTS)[number];

export function isMediaVariant(value: string): value is MediaVariant {
  return (MEDIA_VARIANTS as readonly string[]).includes(value);
}
