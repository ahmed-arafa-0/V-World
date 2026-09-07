import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Captures M03-A Content Runtime Lab screenshots (English + Arabic,
 * desktop + mobile) against the local Firebase emulators (must already be
 * running at http://127.0.0.1:5050 — e.g. `npm run emulators:build` in
 * another terminal). Never uses the real Gate code: every `/api/*` call is
 * intercepted with a canned, fixture-shaped response so this script never
 * touches the real Sheet, never requires E2E_GATE_CODE, and never logs a
 * real credential or session value. This is an evidence-capture aid only,
 * not a live-verification script.
 */

const dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dirname, '..', 'docs', 'reports', 'M03');
mkdirSync(outDir, { recursive: true });

const baseUrl = 'http://127.0.0.1:5050';

const SAMPLE_OWNER_SESSION = {
  kind: 'owner',
  userId: 'fixture_owner',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2026-01-02T00:00:00.000Z',
  lastSeenAt: '2026-01-01T00:00:00.000Z',
};

const CONTENT_RUNTIME_RESPONSE = {
  ok: true,
  languages: [
    {
      localeId: 'en',
      shortCode: 'EN',
      englishName: 'English',
      nativeName: 'English',
      direction: 'ltr',
      fallbackLocale: 'en',
      sortOrder: 1,
    },
    {
      localeId: 'ar-EG',
      shortCode: 'AR',
      englishName: 'Egyptian Arabic',
      nativeName: 'العربية المصرية',
      direction: 'rtl',
      fallbackLocale: 'en',
      sortOrder: 2,
    },
    {
      localeId: 'it',
      shortCode: 'IT',
      englishName: 'Italian',
      nativeName: 'Italiano',
      direction: 'ltr',
      fallbackLocale: 'en',
      sortOrder: 3,
    },
    {
      localeId: 'el',
      shortCode: 'EL',
      englishName: 'Greek',
      nativeName: 'Ελληνικά',
      direction: 'ltr',
      fallbackLocale: 'en',
      sortOrder: 4,
    },
    {
      localeId: 'fr',
      shortCode: 'FR',
      englishName: 'French',
      nativeName: 'Français',
      direction: 'ltr',
      fallbackLocale: 'en',
      sortOrder: 5,
    },
  ],
  uiText: [
    {
      uiTextRowId: 'uit_content_lab_title_en',
      textId: 'content_lab_title',
      screenId: 'content_lab',
      componentId: 'heading',
      locale: 'en',
      text: 'Content Runtime Lab',
      direction: 'ltr',
      ariaLabel: 'Content Runtime Lab heading',
    },
    {
      uiTextRowId: 'uit_content_lab_title_ar',
      textId: 'content_lab_title',
      screenId: 'content_lab',
      componentId: 'heading',
      locale: 'ar-EG',
      text: 'معمل تشغيل المحتوى',
      direction: 'rtl',
      ariaLabel: 'عنوان معمل تشغيل المحتوى',
    },
    {
      uiTextRowId: 'uit_content_lab_incomplete_ar',
      textId: 'content_lab_incomplete',
      screenId: 'content_lab',
      componentId: 'note',
      locale: 'ar-EG',
      text: 'ملاحظة بالعربية فقط',
      direction: 'rtl',
      ariaLabel: 'ملاحظة',
    },
  ],
  dialogue: [
    {
      dialogueRowId: 'dlg_boot_en',
      dialogueId: 'dlg_boot',
      groupId: 'grp_boot',
      sequence: 1,
      speakerId: 'char_var',
      locale: 'en',
      text: 'Hello, Veoulla.',
      direction: 'ltr',
      emotion: 'warm',
      displayMode: 'speech_bubble',
      voiceoverMediaRef: '/api/media/asset_vo_boot_en?v=1',
      requiresResponse: false,
    },
    {
      dialogueRowId: 'dlg_boot_ar',
      dialogueId: 'dlg_boot',
      groupId: 'grp_boot',
      sequence: 1,
      speakerId: 'char_var',
      locale: 'ar-EG',
      text: 'أهلاً يا فيولا.',
      direction: 'rtl',
      emotion: 'warm',
      displayMode: 'speech_bubble',
      voiceoverMediaRef: '/api/media/asset_vo_boot_ar?v=1',
      requiresResponse: false,
    },
  ],
  voiceover: [
    {
      voiceoverId: 'vo_boot_en',
      contentType: 'dialogue',
      contentId: 'dlg_boot',
      locale: 'en',
      mediaRef: '/api/media/asset_vo_boot_en?v=1',
      captionText: 'Hello, Veoulla.',
      direction: 'ltr',
      durationMs: 2000,
      captionStartMs: 0,
      captionEndMs: 2000,
    },
  ],
  icons: [
    {
      iconId: 'icon_map',
      category: 'ui',
      displayName: 'Map',
      mediaRef: '/api/media/asset_icon_map?v=1',
      format: 'svg',
      rtlMirror: false,
      altTextId: 'ui_map',
    },
    {
      iconId: 'icon_back',
      category: 'ui',
      displayName: 'Back',
      mediaRef: '/api/media/asset_icon_back?v=1',
      format: 'svg',
      rtlMirror: true,
      altTextId: 'ui_back',
    },
  ],
  assets: [
    {
      assetId: 'asset_icon_map',
      assetType: 'image',
      version: 1,
      preloadPriority: 1,
      hasMobileVariant: false,
      hasPosterVariant: false,
      mediaRef: '/api/media/asset_icon_map?v=1',
    },
  ],
  diagnostics: [
    {
      code: 'MISSING_ENGLISH_FALLBACK',
      tab: '08_UI_TEXT',
      subjectId: 'content_lab_incomplete',
      message: 'No enabled English ("en") row exists for "content_lab_incomplete" in 08_UI_TEXT.',
    },
  ],
  cacheGeneratedAt: '2026-01-01T00:00:00.000Z',
  requestId: 'capture-request-id',
};

function jsonRoute(body) {
  return (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function withMockedOwnerSession(page) {
  await page.route('**/api/session/owner*', jsonRoute({ ok: true, session: SAMPLE_OWNER_SESSION }));
  await page.route(
    '**/api/session/owner/heartbeat',
    jsonRoute({ ok: true, session: SAMPLE_OWNER_SESSION }),
  );
  await page.route('**/api/content/runtime*', jsonRoute(CONTENT_RUNTIME_RESPONSE));
  await page.route('**/api/access/page-open', jsonRoute({ ok: true, logId: 'capture_log' }));
}

async function capture(browserType, contextOptions, fileName, { locale } = {}) {
  const browser = await browserType.launch();
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  try {
    await withMockedOwnerSession(page);
    await page.goto(`${baseUrl}/`);
    await page.waitForSelector('[data-testid="content-runtime-lab"]', { timeout: 20000 });
    if (locale) {
      await page.getByTestId(`locale-button-${locale}`).click();
      await page.waitForSelector(`html[dir="${locale === 'ar-EG' ? 'rtl' : 'ltr'}"]`, {
        timeout: 5000,
      });
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(outDir, fileName), fullPage: true });
  } finally {
    await browser.close();
  }
}

const desktop = { viewport: { width: 1440, height: 1000 } };
const mobile = { ...devices['Pixel 7'] };

await capture(chromium, desktop, 'content-runtime-lab-english-desktop.png');
await capture(chromium, mobile, 'content-runtime-lab-english-mobile.png');
await capture(chromium, desktop, 'content-runtime-lab-arabic-desktop.png', { locale: 'ar-EG' });
await capture(chromium, mobile, 'content-runtime-lab-arabic-mobile.png', { locale: 'ar-EG' });

console.log('Screenshots written to', outDir);
