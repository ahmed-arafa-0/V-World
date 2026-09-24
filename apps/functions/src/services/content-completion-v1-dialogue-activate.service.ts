import type { SheetGateway } from '../repositories/sheet-gateway.js';
import {
  DIALOGUE_GROUP_PROPOSALS,
  buildDialogueGroupRows,
  type DialogueGroupProposal,
} from './content-completion-v1-dialogue-seed.service.js';

/**
 * Turns on the 80 first-journey dialogue rows that
 * `content-completion-v1-dialogue-seed.service.ts` inserted `enabled: 'FALSE'` (by design — that
 * file only inserts text, it never switches anything on). Ahmed has now authorized activating this
 * already-inserted, already-translated content; this file never modifies the seed file itself, so
 * its "unmodified, reused as-is" provenance stays intact.
 *
 * Reuses the seed file's own `buildDialogueGroupRows()` purely to derive the exact 80
 * `dialogue_row_id`s (never re-inserts anything — `appendRowsIfAbsent` is not called here at all).
 * `dlg_gate`/`dlg_naming` (the pre-existing 7 rows) are never in `DIALOGUE_GROUP_PROPOSALS`, so they
 * are structurally impossible to touch from this file.
 *
 * Idempotent: rows already `enabled: TRUE` are skipped (not merely re-written), so a rerun after a
 * partial failure only patches whatever is still `FALSE`.
 */
export interface DialogueActivationOutcome {
  enabled: string[];
  alreadyEnabled: string[];
  missing: string[];
}

export async function activateDialogueGroupProposals(
  gateway: SheetGateway,
  proposals: readonly DialogueGroupProposal[] = DIALOGUE_GROUP_PROPOSALS,
): Promise<DialogueActivationOutcome> {
  const targetRows = buildDialogueGroupRows(proposals);
  const current = await gateway.readTab('15_DIALOGUE', { bypass: true });
  const byRowId = new Map(current.rows.map((r) => [r.primaryKeyValue ?? '', r]));

  const outcome: DialogueActivationOutcome = { enabled: [], alreadyEnabled: [], missing: [] };
  for (const target of targetRows) {
    const rowId = target.dialogue_row_id!;
    const existing = byRowId.get(rowId);
    if (!existing) {
      outcome.missing.push(rowId);
      continue;
    }
    if (existing.values.enabled === true) {
      outcome.alreadyEnabled.push(rowId);
      continue;
    }
    await gateway.updateByPrimaryKey('15_DIALOGUE', rowId, { enabled: 'TRUE' });
    outcome.enabled.push(rowId);
  }
  return outcome;
}
