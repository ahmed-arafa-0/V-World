/* global document, innerWidth, innerHeight, getComputedStyle */
/** Network-free visual regression: real built UI + unchanged API/auth handlers,
 * in-memory Sheets and local handoff art. No live sessions or progress touched. */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import express from 'express';
import { chromium, expect } from '@playwright/test';
import {
  buildM02Workbook,
  headerFor,
  row,
  M02_FAKE_GATE_CODE,
} from '@veoullas-world/test-fixtures';
import { createApp } from '../apps/functions/lib/app.js';
import { SheetGateway } from '../apps/functions/lib/repositories/sheet-gateway.js';
import { SCENE_CHARACTER_ASSET_SEED_ROWS } from '../apps/functions/lib/services/phase1-scene-character-assets-seed.service.js';

const evidence = path.resolve('docs/reports/PHASE1_PRESENTATION');
fs.mkdirSync(evidence, { recursive: true });
const helperPath = path.join(evidence, 'fake-sheets.generated.mjs');
fs.writeFileSync(
  helperPath,
  ts.transpileModule(
    fs.readFileSync('apps/functions/tests/helpers/fake-sheets-client.ts', 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } },
  ).outputText,
);
const { FakeGoogleSheetsClient } = await import(pathToFileURL(helperPath).href);
fs.unlinkSync(helperPath);
const browser = await chromium.launch();
const results = [];

async function serverForFixture() {
  const workbook = structuredClone(buildM02Workbook());
  const files = {};
  workbook['10_ASSETS'] = [headerFor('10_ASSETS')];
  for (const spec of SCENE_CHARACTER_ASSET_SEED_ROWS) {
    for (const [folder, filename] of [
      ['desktop', spec.desktopFile],
      ['mobile', spec.mobileFile],
      ['characters', spec.singleFile],
    ]) {
      if (filename) files[filename] = fs.readFileSync(path.join('assets/phase1', folder, filename));
    }
    workbook['10_ASSETS'].push(
      row('10_ASSETS', {
        asset_id: spec.assetId,
        asset_type: 'image',
        drive_file_id: spec.desktopFile ?? spec.singleFile,
        mobile_drive_file_id: spec.mobileFile ?? '',
        preload_priority: '1',
        enabled: 'TRUE',
        version: '1',
        loop: 'FALSE',
      }),
    );
  }
  // Representative narrative fixtures; production still resolves the unchanged live Sheet rows.
  workbook['15_DIALOGUE'] = [
    headerFor('15_DIALOGUE'),
    ...['dlg_gate_01', 'dlg_name_01'].map((id) =>
      row('15_DIALOGUE', {
        dialogue_row_id: `${id}_en`,
        dialogue_id: id,
        group_id: id,
        sequence: '1',
        speaker_id: 'var',
        locale: 'en',
        text:
          id === 'dlg_name_01'
            ? 'Before we explore, will you choose a name for me?'
            : 'Welcome. Your world is waiting beyond the Gate.',
        direction: 'ltr',
        display_mode: 'speech_bubble',
        requires_response: 'TRUE',
        enabled: 'TRUE',
        version: '1',
      }),
    ),
  ];
  const gateway = new SheetGateway(new FakeGoogleSheetsClient(workbook), { ttlSeconds: 60 });
  const drive = {
    async getFileMetadata(id) {
      return {
        id,
        name: id,
        mimeType: 'image/png',
        size: files[id]?.length ?? 0,
        parents: ['fixture_drive_root_folder_id'],
        trashed: false,
      };
    },
    async getFileContentStream(id) {
      if (!files[id]) throw Error(`Missing fixture ${id}`);
      return { stream: Readable.from(files[id]) };
    },
    async findFilesByName() {
      return [];
    },
  };
  const app = express();
  app.use(express.static(path.resolve('apps/web/dist')));
  app.use(
    createApp({
      getGateway: () => gateway,
      getDriveClient: () => drive,
      isProduction: () => false,
      getEnvironment: () => 'local',
    }),
  );
  app.use(express.static(path.resolve('apps/web/dist')));
  app.get('*', (_req, res) => res.sendFile(path.resolve('apps/web/dist/index.html')));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

try {
  for (const [name, viewport] of Object.entries({
    desktop: { width: 1440, height: 900 },
    mobile: { width: 393, height: 852 },
  })) {
    const { server, origin } = await serverForFixture();
    const context = await browser.newContext({
      viewport,
      hasTouch: name === 'mobile',
      isMobile: name === 'mobile',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const checkpoints = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/api/player/checkpoint')) checkpoints.push(req.postDataJSON());
    });
    async function capture(beat) {
      await page.waitForFunction(() =>
        [...document.images].every((img) => img.complete && img.naturalWidth > 0),
      );
      await page.waitForTimeout(500);
      const geometry = await page.evaluate(() => {
        const rect = document
          .querySelector('[data-testid="scene-image-plane"]')
          ?.getBoundingClientRect();
        return {
          width: innerWidth,
          height: innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          plane: rect && { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          image: [...document.images].map((img) => ({
            src: img.currentSrc.split('/api/')[1],
            width: img.naturalWidth,
            height: img.naturalHeight,
          })),
        };
      });
      expect(geometry.scrollWidth).toBe(geometry.width);
      expect(geometry.scrollHeight).toBe(geometry.height);
      if (geometry.plane) {
        expect(geometry.plane.left).toBeLessThanOrEqual(1);
        expect(geometry.plane.top).toBeLessThanOrEqual(1);
        expect(geometry.plane.right).toBeGreaterThanOrEqual(geometry.width - 1);
        expect(geometry.plane.bottom).toBeGreaterThanOrEqual(geometry.height - 1);
      }
      await expect(
        page.getByText(
          /Access granted|Engineering Labs|Content Runtime Lab|DEV PLACEHOLDER|Interacted with:/,
        ),
      ).toHaveCount(0);
      await expect(
        page.locator('[data-testid="step"], [data-occluder], [data-testid="scene-debug-overlay"]'),
      ).toHaveCount(0);
      await page.screenshot({ path: path.join(evidence, `${beat}-${name}.png`), fullPage: true });
      results.push({ viewport: name, beat, geometry });
      console.log(
        `PASS ${name}: ${beat}, viewport fill, decoded art, no duplicate geometry or engineering UI`,
      );
    }
    try {
      // Unauthenticated owner content must remain protected even in this isolated test.
      expect((await context.request.get(`${origin}/api/player/state`)).status()).toBe(401);
      expect(
        (await context.request.get(`${origin}/api/media/beach_focus_scene?v=1`)).status(),
      ).toBe(401);
      await page.goto(origin);
      await page.getByTestId('pre-gate-continue').click();
      await page.getByTestId('pre-gate-continue').click();
      await page.getByTestId('pre-gate-continue').click();
      await capture('gate-reveal');
      await page.getByTestId('pre-gate-continue').click();
      await capture('gate');
      // Normal Gate submission against fixture credentials, never cookie injection.
      await page.getByTestId('gate-root').focus();
      await page.keyboard.type(M02_FAKE_GATE_CODE);
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('doors-opening-continue')).toBeVisible();
      await capture('gate-ajar');
      await page.getByTestId('doors-opening-continue').click();
      await expect(page.getByTestId('beach-arrival')).toBeVisible();
      await capture('beach-arrival');
      await page.getByTestId('beach-arrival-continue').click();
      await expect(page.getByTestId('naming-name-input')).toBeVisible();
      await expect(page.getByTestId('naming-character-no-collar')).toBeVisible();
      await expect(page.getByTestId('walk-forward')).toHaveCount(0);
      await capture('naming-before');
      await page.getByTestId('naming-name-input').fill('Luna');
      await page.getByTestId('naming-gender-female').check();
      await page.getByTestId('naming-submit').click();
      await expect(page.getByTestId('naming-character-collar')).toBeVisible();
      await expect(page.getByTestId('naming-character-no-collar')).toHaveCount(0);
      await capture('naming-after');
      // No timer may advance past the collar reveal.
      await expect(page.getByTestId('naming-continue')).toBeVisible();
      await page.getByTestId('naming-continue').click();
      for (const id of ['beach_focus', 'beach_steps', 'steps_church_approach', 'church_focus']) {
        await expect(page.getByTestId(`scene-stage-${id}`)).toBeVisible();
        await capture(id);
        if (id !== 'church_focus') {
          const before = checkpoints.length;
          // Keyboard on desktop and touch on mobile, one checkpoint per deliberate step.
          if (name === 'desktop') {
            await page.getByTestId('walk-forward').focus();
            await page.keyboard.press('Enter');
          } else await page.getByTestId('walk-forward').tap();
          await expect(page.getByTestId('walk-back')).toBeDisabled();
          await page.waitForTimeout(900);
          expect(checkpoints.length).toBe(before + 1);
        }
      }
      // Resume must retain the endpoint without replaying naming or opening a Map.
      await page.reload();
      await expect(page.getByTestId('scene-stage-church_focus')).toBeVisible();
      await expect(page.getByTestId('naming-prompt')).toHaveCount(0);
      await page.getByLabel('Settings', { exact: true }).click();
      await page.getByRole('button', { name: 'العربية المصرية', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await capture('church-rtl');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.getByTestId('walk-back').click();
      await expect(page.getByTestId('scene-stage-steps_church_approach')).toBeVisible();
      expect(
        await page
          .getByTestId('scene-stage-steps_church_approach')
          .evaluate((el) => getComputedStyle(el).animationName),
      ).toBe('none');
      await page.setViewportSize({ width: 852, height: 393 });
      await capture('landscape-reduced-motion');
      expect(errors).toEqual([]);
      console.log(
        `PASS ${name}: real auth boundaries, keyboard/touch travel, transition lock, resume, RTL, reduced motion`,
      );
    } catch (error) {
      await page.screenshot({ path: path.join(evidence, `failure-${name}.png`) });
      console.error(await page.locator('body').innerText());
      throw error;
    } finally {
      await context.close();
      await new Promise((resolve) => server.close(resolve));
    }
  }
  fs.writeFileSync(path.join(evidence, 'results.json'), JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
