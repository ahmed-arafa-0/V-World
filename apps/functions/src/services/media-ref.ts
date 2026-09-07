/**
 * Builds the stable same-origin media reference the M03-B Drive media
 * gateway will serve. This is a path convention only — no Drive file is
 * read or streamed in M03-A. Never derived from or containing a raw Drive
 * file ID; callers must never fall back to a Drive file ID when this
 * cannot be built.
 */
export function buildMediaRef(assetId: string, version: number): string {
  return `/api/media/${encodeURIComponent(assetId)}?v=${version}`;
}
