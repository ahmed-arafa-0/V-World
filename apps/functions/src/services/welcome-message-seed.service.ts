import type { ParseTabResult } from '@veoullas-world/sheet-schema';
import type { SheetGateway } from '../repositories/sheet-gateway.js';

/** Only these existing authoring prompts may be replaced; arbitrary nonblank text is a conflict. */
const TARGETS = [
  ['en', 'msg_welcome_en', "<WRITE AHMED'S FIRST MESSAGE>"],
  ['ar-EG', 'msg_welcome_ar', '<اكتب رسالة أحمد الأولى>'],
  ['it', 'msg_welcome_it', '<SCRIVI IL PRIMO MESSAGGIO DI AHMED>'],
  ['el', 'msg_welcome_el', '<ΓΡΑΨΕ ΤΟ ΠΡΩΤΟ ΜΗΝΥΜΑ ΤΟΥ AHMED>'],
  ['fr', 'msg_welcome_fr', "<ÉCRIRE LE PREMIER MESSAGE D'AHMED>"],
] as const;

export interface WelcomeMessageInput {
  messageId: string;
  texts: Record<string, string>;
}
export interface WelcomeMessagePlan {
  rows: {
    id: string;
    locale: string;
    before: Record<string, string>;
    after: Record<string, string>;
    action: 'update' | 'unchanged';
  }[];
  conflicts: { id: string; reason: string }[];
}
export function planWelcomeMessage(
  table: ParseTabResult,
  formulas: string[][],
  input: WelcomeMessageInput,
): WelcomeMessagePlan {
  if (input.messageId !== 'msg_welcome_ahmed')
    throw Error('This seed only supports the approved welcome message.');
  const plan: WelcomeMessagePlan = { rows: [], conflicts: [] };
  const header = formulas[0] ?? [];
  const keyIndex = header.indexOf('message_row_id'),
    textIndex = header.indexOf('text');
  if (keyIndex < 0 || textIndex < 0)
    throw Error('Formula-preserving preview requires the message header.');
  for (const [locale, id, placeholder] of TARGETS) {
    const matches = table.rows.filter((r) => r.primaryKeyValue === id);
    const row = matches[0];
    const desired = input.texts[locale];
    const cells = formulas.slice(1).filter((r) => r[keyIndex] === id);
    const formulaText = cells[0]?.[textIndex] ?? '';
    const reason =
      matches.length !== 1 || cells.length !== 1
        ? 'Missing or duplicate existing row'
        : row?.raw.message_id !== input.messageId ||
            row?.raw.locale !== locale ||
            row?.raw.recipient_user_id !== 'veoulla' ||
            row?.raw.delivery_at !== '<FIRST_VISIT>' ||
            row?.values.enabled !== true
          ? 'Unexpected identity, recipient, schedule or enabled flag'
          : !desired?.trim()
            ? 'Approved text missing'
            : formulaText.startsWith('=')
              ? 'Existing text cell contains a formula'
              : formulaText.trim() && formulaText !== placeholder && formulaText !== desired
                ? 'Different nonblank authored content'
                : null;
    if (reason) {
      plan.conflicts.push({ id, reason });
      continue;
    }
    plan.rows.push({
      id,
      locale,
      before: { ...row!.raw },
      after: { ...row!.raw, text: desired! },
      action: formulaText === desired ? 'unchanged' : 'update',
    });
  }
  return plan;
}

/** The normal backend gateway, deliberately NOT the review gateway. Never appends or writes player tabs. */
export async function applyWelcomeMessage(
  gateway: SheetGateway,
  plan: WelcomeMessagePlan,
): Promise<string[]> {
  if (plan.conflicts.length)
    throw Error('Welcome message conflicts must be resolved before applying.');
  // Check every affected row before the first write. updateByPrimaryKey writes only this named column.
  const found = await Promise.all(
    plan.rows.map((r) =>
      gateway.findByPrimaryKey('19_MESSAGES', r.id, { bypass: true, strict: true }),
    ),
  );
  for (const [i, row] of plan.rows.entries()) {
    if (!found[i] || JSON.stringify(found[i]!.row.raw) !== JSON.stringify(row.before))
      throw Error(`Row changed after preview: ${row.id}`);
  }
  const changed: string[] = [];
  for (const [i, row] of plan.rows.entries()) {
    if (row.action === 'unchanged') continue;
    await gateway.updateByPrimaryKey('19_MESSAGES', row.id, { text: row.after.text! }, found[i]);
    changed.push(row.id);
  }
  return changed;
}
