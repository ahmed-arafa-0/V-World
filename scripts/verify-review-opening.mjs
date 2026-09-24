import { chromium, expect } from '@playwright/test';
import { startPhase2Fixture, M02_FAKE_GATE_CODE } from './lib/phase2-fixture.mjs';
const f = await startPhase2Fixture({ artPack: true });
const b = await chromium.launch();
const p = await b.newPage();
try {
  await p.goto(f.origin);
  await expect(p.getByTestId('pre-gate-black-opening')).toBeVisible();
  for (let i = 0; i < 4; i++) await p.getByTestId('pre-gate-continue').click();
  for (let i = 0; i < 4; i++) await p.getByRole('spinbutton').nth(i).press(M02_FAKE_GATE_CODE[i]);
  await p.locator('button[type=submit]').click();
  await p.getByTestId('doors-opening-continue').click();
  await p.getByTestId('beach-arrival-continue').click();
  await expect(p.getByTestId('naming-name-input')).toHaveValue('');
  await p.getByTestId('naming-name-input').fill('Review Fixture');
  await p.getByTestId('naming-gender-female').check();
  await p.getByTestId('naming-submit').click();
  await expect(p.getByTestId('collar-name')).toHaveText('Review Fixture');
  console.log(
    'PASS separate fixture: black opening → Gate code → doors → Beach → empty naming → saved name. Final review untouched.',
  );
} finally {
  await b.close();
  f.server.close();
}
