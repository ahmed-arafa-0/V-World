import type { Page } from '@playwright/test';

/**
 * Skips the one-time unseen-VAR-then-reveal Gate opening sequence (Phase 1
 * item F, `PreGateSequence`) by pre-seeding the same `sessionStorage` flag
 * the real component checks — call before `page.goto('/')` in any spec that
 * exercises the dial form or what follows it, not the opening sequence
 * itself (that has its own dedicated coverage in `gate.spec.ts`).
 */
export async function skipGateOpening(page: Page): Promise<void> {
  await page.addInitScript(() => window.sessionStorage.setItem('vw_gate_opening_seen', 'true'));
}
