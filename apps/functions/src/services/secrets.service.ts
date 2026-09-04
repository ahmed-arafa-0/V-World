import type { ReadOptions, SheetGateway } from '../repositories/sheet-gateway.js';

export type SecretResult =
  { status: 'enabled'; value: string } | { status: 'disabled' } | { status: 'not_found' };

/**
 * Backend-only. Reads one 03_SECRETS_DEV row by its stable secret_id.
 * Never call this from an HTTP handler that forwards the result to the
 * frontend, and never log the returned value — this is foundation for a
 * later milestone (e.g. Gemini in M15), not an exposed capability today.
 */
export async function getSecret(
  gateway: SheetGateway,
  secretId: string,
  options?: ReadOptions,
): Promise<SecretResult> {
  const result = await gateway.readTab('03_SECRETS_DEV', options);
  const row = result.rows.find((r) => r.primaryKeyValue === secretId);
  if (!row) return { status: 'not_found' };
  if (row.values.enabled !== true) return { status: 'disabled' };
  return { status: 'enabled', value: String(row.raw.plaintext_value ?? '') };
}
