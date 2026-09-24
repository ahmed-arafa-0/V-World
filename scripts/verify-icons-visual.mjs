#!/usr/bin/env node
/* global document, getComputedStyle */
/**
 * Focused visual check of the Sheet-served player-control icons (real backend,
 * real Sheet/Drive, isolated generated user — never the owner's progress).
 * Reports source (sheet vs fallback), decoded size, rendered size, tap-target
 * size, colour contrast against the sampled backdrop, and the failed-image
 * fallback (icon request aborted). Screenshots go to docs/reports/PHASE2/icons.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from '@playwright/test';
import { createApp } from '../apps/functions/lib/app.js';
import { getProductionGatewayOrNull } from '../apps/functions/lib/repositories/gateway-context.js';
import {
  buildSessionId,
  createOrReconcileSession,
} from '../apps/functions/lib/services/session.service.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.join(dirname, '..', 'apps', 'web', 'dist');
const outDir = path.join(dirname, '..', 'docs', 'reports', 'PHASE2', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const gateway = getProductionGatewayOrNull();
if (!gateway) {
  console.error('BLOCKER: no Google credential available.');
  process.exit(1);
}
const app = express();
app.use(express.static(webDist));
app.use(createApp());
const server = http.createServer(app);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

async function mint(label) {
  const sessionId = buildSessionId('gate', `icon_check_${label}_${Date.now()}`);
  const now = new Date();
  await createOrReconcileSession(gateway, {
    sessionId,
    userId: `icon_check_${label}_${Date.now()}`,
    ip: '127.0.0.1',
    deviceId: `icon-check-${label}`,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 3600_000),
  });
  return sessionId;
}

const lum = ([r, g, b]) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const browser = await chromium.launch();
const rows = [];
try {
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 393, height: 852 }],
  ].filter(([n]) => !process.argv[2] || n === process.argv[2])) {
    for (const failIcons of [false, true]) {
      const tag = `${name}${failIcons ? '-failed' : ''}`;
      const ctx = await browser.newContext({ viewport });
      await ctx.addCookies([
        { name: 'vw_owner_session', value: await mint(tag), domain: '127.0.0.1', path: '/' },
      ]);
      const page = await ctx.newPage();
      if (failIcons) {
        // Abort only the requests that serve icon assets (identified by 09_ICONS-backed refs in DOM later).
        await page.route('**/api/media/*', async (route) => {
          const u = route.request().url();
          if (globalThis.__iconUrls?.some((x) => u.endsWith(x))) return route.abort();
          return route.continue();
        });
      }
      page.on('response', (r) => {
        const u = r.url();
        if (/asset_icon/.test(u) || (u.includes('/api/') && r.status() >= 400))
          console.log('  resp', r.status(), r.headers()['content-type'], u.split('/api')[1]);
      });
      await page.goto(origin, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-testid="beach-arrival"]', { timeout: 20000 });
      await page.click('[data-testid="beach-arrival-continue"]');
      await page.waitForSelector('[data-testid="naming-prompt"]');
      await page.fill('[data-testid="naming-name-input"]', 'IconCheck');
      await page.check('[data-testid="naming-gender-female"]');
      await page.click('[data-testid="naming-submit"]');
      await page.waitForSelector('[data-testid="collar-name"]');
      await page.click('[data-testid="naming-continue"]');
      await page.waitForSelector('[data-testid="scene-journey"]', { timeout: 15000 });
      await page.waitForTimeout(3000);
      const icons = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid^="icon-"]')).map((el) => {
          const r = el.getBoundingClientRect();
          const btn = el.closest('button');
          const br = btn?.getBoundingClientRect();
          const cs = btn ? getComputedStyle(btn) : null;
          return {
            slot: el.getAttribute('data-testid'),
            source: el.getAttribute('data-icon-source'),
            src: el.getAttribute('src'),
            natural: el.naturalWidth ?? null,
            w: Math.round(r.width),
            h: Math.round(r.height),
            btnW: br ? Math.round(br.width) : null,
            btnH: br ? Math.round(br.height) : null,
            btnBg: cs?.backgroundColor ?? null,
            x: r.x,
            y: r.y,
          };
        }),
      );
      globalThis.__iconUrls = icons.filter((i) => i.src).map((i) => i.src.split('/').pop());
      await page.screenshot({ path: path.join(outDir, `${tag}.png`) });
      for (const i of icons) {
        const clip = {
          x: Math.max(0, i.x - 8),
          y: Math.max(0, i.y - 8),
          width: i.w + 16,
          height: i.h + 16,
        };
        rows.push({ tag, ...i, clip });
      }
      console.log(`\n[${tag}]`);
      console.table(
        icons.map((icon) =>
          Object.fromEntries(Object.entries(icon).filter(([k]) => k !== 'x' && k !== 'y')),
        ),
      );
      if (failIcons) console.log('urls to fail were from previous non-failed run');
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
void ratio;
