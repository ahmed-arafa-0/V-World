#!/usr/bin/env node
/* global document, window */
/**
 * Focused, Sheet-free visual check of the illustrated Beach->Church scenes:
 * a Vite dev server (apps/web) with every /api/* call fulfilled by Playwright
 * route mocks and the local, uncommitted Phase 1 art in assets/phase1/.
 * Nothing touches the live Sheet/Drive and nothing is written anywhere except
 * the screenshot folder.
 *
 *   node scripts/verify-scene-polish-mocked.mjs <outDir> [baseUrl] [--icons]
 *
 * --icons  serve a realistic 09_ICONS list (SVG assets) for icon-driven checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const art = path.join(dirname, '..', 'assets', 'phase1');
const outDir = path.resolve(process.argv[2] ?? path.join(dirname, '..', 'tmp-shots'));
const baseUrl =
  process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'http://localhost:5199';
const withSheetIcons = process.argv.includes('--icons');
fs.mkdirSync(outDir, { recursive: true });

const FILES = {
  beach_focus_scene: ['desktop/beach_focus_desktop_v1.png', 'mobile/beach_focus_mobile_v1.png'],
  beach_three_steps_scene: [
    'desktop/beach_three_steps_desktop_v1.png',
    'mobile/beach_three_steps_mobile_v1.png',
  ],
  steps_church_approach_scene: [
    'desktop/church_approach_desktop_v1.png',
    'mobile/church_approach_mobile_v1.png',
  ],
  church_focus_scene: ['desktop/church_focus_desktop_v1.png', 'mobile/church_focus_mobile_v1.png'],
  var_idle_no_collar: ['characters/cat_idle_no_collar_v1.png'],
  var_idle_collar: ['characters/cat_idle_collar_v1.png'],
  var_walk_collar: ['characters/cat_walk_collar_v1.png'],
};
const asset = (assetId, hasMobile) => ({
  assetId,
  assetType: 'image',
  version: 1,
  preloadPriority: 1,
  hasMobileVariant: hasMobile,
  hasPosterVariant: false,
  mediaRef: `/api/media/${assetId}?v=1`,
});
const languages = [
  ['en', 'EN', 'English', 'English', 'ltr'],
  ['ar-EG', 'AR', 'Egyptian Arabic', 'العربية المصرية', 'rtl'],
  ['it', 'IT', 'Italian', 'Italiano', 'ltr'],
  ['el', 'EL', 'Greek', 'Ελληνικά', 'ltr'],
  ['fr', 'FR', 'French', 'Français', 'ltr'],
].map(([localeId, shortCode, englishName, nativeName, direction], i) => ({
  localeId,
  shortCode,
  englishName,
  nativeName,
  direction,
  fallbackLocale: 'en',
  sortOrder: i + 1,
}));
const runtime = {
  ok: true,
  languages,
  uiText: [],
  dialogue: [],
  // Mirrors the real Sheet (09_ICONS has no forward/look/interact/settings rows).
  icons: [
    {
      iconId: 'icon_map',
      category: 'ui',
      displayName: 'Map',
      mediaRef: null,
      format: 'svg',
      rtlMirror: false,
      altTextId: 'ui_map',
    },
    {
      iconId: 'icon_language',
      category: 'ui',
      displayName: 'Language',
      mediaRef: null,
      format: 'svg',
      rtlMirror: false,
      altTextId: 'ui_language',
    },
    {
      iconId: 'icon_walkman',
      category: 'ui',
      displayName: 'Walkman',
      mediaRef: null,
      format: 'svg',
      rtlMirror: false,
      altTextId: 'ui_walkman',
    },
    {
      iconId: 'icon_back',
      category: 'ui',
      displayName: 'Back',
      mediaRef: null,
      format: 'svg',
      rtlMirror: true,
      altTextId: 'ui_back',
    },
    ...(withSheetIcons
      ? [
          {
            iconId: 'icon_walk_forward',
            category: 'ui',
            displayName: 'Walk forward',
            mediaRef: '/api/media/asset_icon_walk_forward?v=1',
            format: 'svg',
            rtlMirror: false,
            altTextId: 'ui_forward',
          },
        ]
      : []),
  ],
  assets: [
    asset('beach_focus_scene', true),
    asset('beach_three_steps_scene', true),
    asset('steps_church_approach_scene', true),
    asset('church_focus_scene', true),
    asset('var_idle_no_collar', false),
    asset('var_idle_collar', false),
    asset('var_walk_collar', false),
  ],
  diagnostics: [],
  cacheGeneratedAt: '2026-01-01T00:00:00.000Z',
  requestId: 'mock',
};
const SESSION = {
  kind: 'owner',
  userId: 'mock_owner',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2030-01-01T00:00:00.000Z',
  lastSeenAt: '2026-01-01T00:00:00.000Z',
};
const WALK_FORWARD_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" fill="none" stroke="#f00" stroke-width="2"/></svg>';

async function mock(page, startNode) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const p = url.pathname;
    const method = route.request().method();
    const json = (body) => route.fulfill({ json: body });
    if (p.startsWith('/api/media/')) {
      const id = decodeURIComponent(p.split('/').pop());
      if (id === 'asset_icon_walk_forward')
        return route.fulfill({ body: WALK_FORWARD_SVG, contentType: 'image/svg+xml' });
      const files = FILES[id];
      if (!files) return route.fulfill({ status: 404, json: { ok: false } });
      const file = url.searchParams.get('variant') === 'mobile' && files[1] ? files[1] : files[0];
      return route.fulfill({
        body: fs.readFileSync(path.join(art, file)),
        contentType: 'image/png',
      });
    }
    if (p === '/api/session/owner' && method === 'GET') return json({ ok: true, session: SESSION });
    if (p.startsWith('/api/session/owner/heartbeat')) return json({ ok: true, session: SESSION });
    if (p.startsWith('/api/content/runtime')) return json(runtime);
    if (p.startsWith('/api/content/pre-gate'))
      return json({
        ok: true,
        appName: "Veoulla's World",
        languages,
        dialogue: [],
        uiText: [],
        assets: [],
      });
    if (p.startsWith('/api/bootstrap'))
      return json({
        ok: true,
        config: {
          appName: "Veoulla's World",
          defaultLanguage: 'en',
          normalStartLocation: 'cottage',
          authoritativeTimeZone: 'Africa/Cairo',
        },
        languages,
        locations: [
          {
            locationId: 'beach',
            displayNameTextId: 'x',
            subtitleTextId: '',
            mapOrder: 1,
            firstVisitOrder: 1,
            entrySceneId: 's',
            keyTypeId: 'key_shell',
            ambientAssetId: '',
          },
        ],
        storyBeats: [],
        icons: [],
        assets: [],
        currentEvent: null,
        sheetVersion: '1',
        cacheGeneratedAt: '',
        schemaHealth: { status: 'healthy', errorCount: 0, warningCount: 0 },
        requestId: 'm',
      });
    if (p.startsWith('/api/player/state'))
      return json({
        ok: true,
        progress: [
          {
            userId: 'mock_owner',
            routeId: 'first_opening',
            status: 'active',
            currentBeatId: 'naming_complete',
            lastCheckpointId: '',
            currentLocation: 'beach',
            startedAt: '',
            completedAt: '',
            updatedAt: '',
          },
          {
            userId: 'mock_owner',
            routeId: 'first_opening_beach',
            status: 'active',
            currentBeatId: startNode,
            lastCheckpointId: '',
            currentLocation: 'beach',
            startedAt: '',
            completedAt: '',
            updatedAt: '',
          },
        ],
        keys: [],
        achievements: [],
      });
    if (p.startsWith('/api/player/checkpoint'))
      return json({ ok: true, applied: true, reason: 'created' });
    if (p.startsWith('/api/character/state')) return json({ ok: true, character: null });
    if (p.startsWith('/api/access/page-open')) return json({ ok: true, logId: 'l' });
    return json({ ok: true });
  });
}

const NODES = ['beach_focus', 'beach_steps', 'steps_church_approach', 'church_focus'];
const VIEWPORTS = {
  desktop: { width: 1916, height: 909 },
  laptop: { width: 1280, height: 720 },
  mobile: { width: 393, height: 852 },
  mobileLandscape: { width: 852, height: 393 },
};

const browser = await chromium.launch();
const report = [];
try {
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    for (const node of NODES) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await mock(page, node);
      await page.goto(baseUrl);
      await page.waitForSelector(`[data-testid="scene-stage-${node}"]`, { timeout: 15000 });
      await page.waitForFunction(() =>
        Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0),
      );
      await page.waitForTimeout(900);
      const file = path.join(outDir, `${node}-${vpName}.png`);
      await page.screenshot({ path: file });
      const info = await page.evaluate(() => {
        const box = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        };
        return {
          companion: box('[data-testid="scene-companion"]'),
          shadow: box('[data-testid="scene-cat-shadow"]'),
          pose: document.querySelector('[data-testid="scene-cat"]')?.dataset.pose ?? null,
          forward: box('[data-testid="walk-forward"]'),
          back: box('[data-testid="walk-back"]'),
          look: [box('[data-testid="look-left"]'), box('[data-testid="look-right"]')],
          settings: box('summary'),
          markers: Array.from(document.querySelectorAll('[data-testid^="marker-"]')).map((m) => ({
            id: m.dataset.testid,
            ...m.getBoundingClientRect().toJSON(),
          })),
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      });
      report.push({ vpName, node, errors, ...info });
      await context.close();
    }
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(`wrote ${report.length} shots to ${outDir}`);
for (const r of report) if (r.errors.length) console.log('ERRORS', r.vpName, r.node, r.errors);

// ---- Focused interaction checks (pose, resize, scene change, states, RTL, icons, overlaps) ----
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  if (!ok) console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
};
const hit = (a, b, pad = 0) =>
  a &&
  b &&
  a.x < b.x + b.w + pad &&
  b.x < a.x + a.w + pad &&
  a.y < b.y + b.h + pad &&
  b.y < a.y + a.h + pad;
for (const r of report) {
  const tag = `${r.vpName}/${r.node}`;
  const navs = [
    ['forward', r.forward],
    ['back', r.back],
    ...r.look.map((l, i) => [`look${i}`, l]),
  ].filter(([, b]) => b);
  for (const [n, b] of navs)
    check(`nav ${n} clear of cat sprite [${tag}]`, !hit(b, r.companion, 4), JSON.stringify(b));
  if (r.forward && r.back)
    check(`forward and back do not collide [${tag}]`, !hit(r.forward, r.back, 8));
  for (const m of r.markers)
    if (r.forward)
      check(
        `marker ${m.id} clear of forward [${tag}]`,
        !hit({ x: m.x, y: m.y, w: m.width, h: m.height }, r.forward),
      );
  check(`no horizontal overflow [${tag}]`, !r.overflow);
  check(`cat shadow present under seated cat [${tag}]`, r.shadow && r.pose === 'idle');
  const inView =
    r.companion &&
    r.companion.x >= -1 &&
    r.companion.x + r.companion.w <= VIEWPORTS[r.vpName].width + 1;
  check(`cat sprite inside viewport horizontally [${tag}]`, inView, JSON.stringify(r.companion));
  check(`no page errors [${tag}]`, r.errors.length === 0, r.errors.join('|'));
}

async function clipAround(locator, r) {
  const b = await locator.boundingBox();
  return {
    x: Math.max(0, b.x + b.width / 2 - r),
    y: Math.max(0, b.y + b.height / 2 - r),
    width: r * 2,
    height: r * 2,
  };
}

const b2 = await chromium.launch();
try {
  const ctx = await b2.newContext({ viewport: VIEWPORTS.desktop, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await mock(page, 'beach_focus');
  await page.goto(baseUrl);
  await page.waitForSelector('[data-testid="scene-stage-beach_focus"]');
  await page.waitForFunction(() =>
    Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0),
  );
  await page.waitForTimeout(700);
  const pose = () =>
    page.evaluate(() => document.querySelector('[data-testid="scene-cat"]')?.dataset.pose ?? null);
  check('stationary cat uses the seated pose', (await pose()) === 'idle');
  const src = await page.evaluate(() =>
    document.querySelector('[data-testid="scene-companion"]').getAttribute('src'),
  );
  check('seated pose serves var_idle_collar', src.includes('var_idle_collar'), src);

  // Icons: no raw text glyphs; every control has an svg/img and an accessible name.
  const audit = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        '[data-testid^="walk-"], [data-testid^="marker-"], [data-testid^="look-"], summary',
      ),
    ).map((b) => {
      const r = b.getBoundingClientRect();
      const icon = b.querySelector('svg, img');
      const ir = icon?.getBoundingClientRect();
      return {
        id: b.dataset.testid ?? b.tagName,
        text: b.textContent.trim(),
        name: b.getAttribute('aria-label'),
        iconSize: ir ? Math.round(ir.width) : 0,
        size: Math.round(Math.min(r.width, r.height)),
      };
    }),
  );
  for (const a of audit) {
    check(
      `control ${a.id}: no raw glyph text, real icon rendered`,
      a.text === '' && a.iconSize > 0,
      JSON.stringify(a),
    );
    check(`control ${a.id}: accessible name`, !!a.name);
    check(`control ${a.id}: tap target >= 44px`, a.size >= 44, String(a.size));
  }

  // Hover / pressed / keyboard focus states on walk-forward.
  const fwd = page.locator('[data-testid="walk-forward"]');
  await fwd.hover();
  await page.waitForTimeout(250);
  await page.screenshot({
    path: path.join(outDir, 'state-hover.png'),
    clip: await clipAround(fwd, 70),
  });
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(outDir, 'state-pressed.png'),
    clip: await clipAround(fwd, 70),
  });
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await page.waitForTimeout(150);
  await fwd.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(
    () => document.activeElement?.dataset?.testid ?? document.activeElement?.tagName,
  );
  check('keyboard focus lands on walk-forward', focused === 'walk-forward', String(focused));
  await page.screenshot({
    path: path.join(outDir, 'state-focus.png'),
    clip: await clipAround(fwd, 70),
  });

  // Scene change: walking pose while travelling, seated again afterwards.
  await page.evaluate(() => document.activeElement?.blur());
  await fwd.click();
  let sawWalk = false;
  for (let i = 0; i < 60 && !sawWalk; i++) {
    if ((await pose()) === 'walk') sawWalk = true;
    else await page.waitForTimeout(40);
  }
  check('cat walks while travelling between scenes', sawWalk);
  if (sawWalk) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, 'walking-desktop.png') });
  }
  await page
    .waitForFunction(
      () => document.querySelector('[data-testid="scene-cat"]')?.dataset.pose === 'idle',
      undefined,
      { timeout: 6000 },
    )
    .catch(() => {});
  check('cat is seated again after arriving', (await pose()) === 'idle');

  // Resize: paws stay glued to the same scene-image point.
  await page.waitForTimeout(600);
  const pawPoint = () =>
    page.evaluate(() => {
      const plane = document
        .querySelector('[data-testid="scene-image-plane"]')
        .getBoundingClientRect();
      const cat = document.querySelector('[data-testid="scene-cat"]').getBoundingClientRect();
      return { fx: (cat.x - plane.x) / plane.width, fy: (cat.y - plane.y) / plane.height };
    });
  const before = await pawPoint();
  await page.setViewportSize({ width: 1500, height: 1000 });
  await page.waitForTimeout(500);
  const after = await pawPoint();
  check(
    'paw anchor keeps its scene-image coordinates after resize',
    Math.abs(before.fx - after.fx) < 0.003 && Math.abs(before.fy - after.fy) < 0.003,
    JSON.stringify({ before, after }),
  );
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(outDir, 'resized-to-mobile.png') });
  check(
    'no overflow after resize to mobile',
    !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
  );
  const lookVisible = await page.locator('[data-testid="look-left"]').count();
  check('look controls appear when the artwork is cropped sideways (mobile)', lookVisible === 1);
  if (lookVisible) {
    const planeX = () =>
      page.evaluate(
        () => document.querySelector('[data-testid="scene-image-plane"]').getBoundingClientRect().x,
      );
    const before2 = await planeX();
    await page.locator('[data-testid="look-right"]').click();
    await page.waitForTimeout(150);
    const after2 = await planeX();
    check('look-right pans the view', after2 < before2, `${before2} -> ${after2}`);
    for (let i = 0; i < 8; i++)
      await page
        .locator('[data-testid="look-right"]')
        .click({ timeout: 500 })
        .catch(() => {});
    check(
      'look-right disables at the pan limit',
      await page.locator('[data-testid="look-right"]').isDisabled(),
    );
  }
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.waitForTimeout(600);
  check(
    'look controls hidden when nothing is cropped sideways (desktop)',
    (await page.locator('[data-testid="look-left"]').count()) === 0,
  );

  // RTL: Arabic labels, layout intact.
  await page.locator('summary').click();
  await page.getByRole('button', { name: 'العربية المصرية' }).click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  const label = await page
    .locator('[data-testid="walk-forward"]')
    .getAttribute('aria-label')
    .catch(() => null);
  check('Arabic label on walk-forward', label === 'اتقدمي', String(label));
  check('document is RTL', (await page.evaluate(() => document.documentElement.dir)) === 'rtl');
  await page.screenshot({ path: path.join(outDir, 'rtl-desktop.png') });
  check('no page errors during interaction pass', errs.length === 0, errs.join('|'));
  await ctx.close();
} finally {
  await b2.close();
}
fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify(checks, null, 2));
const failed = checks.filter((c) => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
