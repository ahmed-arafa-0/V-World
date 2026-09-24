import type { SheetGateway } from '../repositories/sheet-gateway.js';

/**
 * Idempotently registers the archived previous-birthday-site link into
 * `34_MUSEUM_EXHIBITS.exhibit_old_site.source_content_id` — the one
 * deliberate exception to "media comes from Drive" (see
 * `world/museum.ts`'s `validHttpsUrl`): a raw external `https://` URL, never
 * a Drive file ID, opened client-side in a new tab and never proxied
 * server-side. Only ever writes that single cell; every other column
 * (unlock rule, position, enabled, wing) is left exactly as configured.
 */
export const ARCHIVE_EXHIBIT_ID = 'exhibit_old_site';

export type ArchiveSiteOutcome =
  | { kind: 'rejected'; reason: string }
  | { kind: 'exhibit_not_found' }
  | { kind: 'created_field' }
  | { kind: 'updated' }
  | { kind: 'unchanged' };

function validHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function seedArchiveSite(
  gateway: SheetGateway,
  url: string,
): Promise<ArchiveSiteOutcome> {
  const validated = validHttpsUrl(url);
  if (!validated) return { kind: 'rejected', reason: `not a well-formed https:// URL: "${url}"` };

  const existing = await gateway.findByPrimaryKey('34_MUSEUM_EXHIBITS', ARCHIVE_EXHIBIT_ID, {
    bypass: true,
  });
  if (!existing) return { kind: 'exhibit_not_found' };

  const current = existing.row.raw.source_content_id ?? '';
  if (current === validated) return { kind: 'unchanged' };

  await gateway.updateByPrimaryKey(
    '34_MUSEUM_EXHIBITS',
    ARCHIVE_EXHIBIT_ID,
    { source_content_id: validated },
    existing,
  );
  return current ? { kind: 'updated' } : { kind: 'created_field' };
}
