/**
 * Builds the sanitized response headers for a media response. Never derives
 * anything from Drive's own file name or metadata — the synthetic filename
 * is built only from the client-supplied `assetId`/`variant` (already known
 * to the browser) and a MIME-derived extension, so nothing from the private
 * Drive is ever reflected back.
 */

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'weba',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
  'application/pdf': 'pdf',
};

export interface MediaHeadersInput {
  assetId: string;
  version: number;
  variant: string;
  mimeType: string;
  totalSize: number;
  /** Present only for a 206 partial response. */
  range?: { start: number; end: number } | null;
}

export function buildMediaHeaders(input: MediaHeadersInput): Record<string, string> {
  const extension = EXTENSION_BY_MIME[input.mimeType] ?? 'bin';
  const filename = `${input.assetId}-${input.variant}.${extension}`;

  const headers: Record<string, string> = {
    'Content-Type': input.mimeType,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `inline; filename="${filename}"`,
    // The URL is version-pinned by the caller (?v=<version>) — a given
    // (assetId, version, variant) triple never changes, so it is safe to
    // cache for a long time, but only in the requesting browser's private
    // cache (never a shared/CDN cache, since access is owner-session-gated).
    'Cache-Control': 'private, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
    ETag: `"${input.assetId}-${input.version}-${input.variant}"`,
  };

  if (input.mimeType === 'image/svg+xml') {
    // SVG can embed <script>/event-handler content; this is the standard
    // mitigation for serving untrusted SVG same-origin (as GitHub/GitLab
    // do for user content): a CSP that forbids script execution and
    // sandboxes the response, on top of nosniff already blocking any
    // MIME-confusion attempt to treat it as HTML.
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }

  if (input.range) {
    headers['Content-Range'] = `bytes ${input.range.start}-${input.range.end}/${input.totalSize}`;
    headers['Content-Length'] = String(input.range.end - input.range.start + 1);
  } else {
    headers['Content-Length'] = String(input.totalSize);
  }

  return headers;
}
