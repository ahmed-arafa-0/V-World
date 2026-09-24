import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { createApp } from '../../apps/functions/lib/app.js';
import { getProductionGatewayOrNull } from '../../apps/functions/lib/repositories/gateway-context.js';
import { createOrReconcileSession } from '../../apps/functions/lib/services/session.service.js';
import { createReviewGateway } from '../review-isolation.mjs';

export const BIRTHDAY_ORIGIN = 'http://127.0.0.1:5052';
export const BIRTHDAY_MANIFEST = 'test-results/birthday-review/manifest.json';
export function assertLocalReview() {
  if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE || process.env.FUNCTION_TARGET)
    throw Error('Local review only.');
}
export async function seedBirthdayReviewer(source, userId) {
  const gateway = createReviewGateway(source, userId, { birthdayOnly: true });
  const iso = new Date().toISOString();
  for (const [tab, key, row] of [
    [
      '24_PLAYER_PROGRESS',
      `${userId}|first_opening`,
      {
        user_route_key: `${userId}|first_opening`,
        user_id: userId,
        story_route_id: 'first_opening',
        status: 'in_progress',
        current_beat_id: 'naming_complete',
        last_checkpoint_id: 'naming_complete',
        updated_at: iso,
      },
    ],
    [
      '37_CHARACTER_STATE',
      `${userId}|var`,
      {
        user_character_key: `${userId}|var`,
        user_id: userId,
        character_id: 'var',
        personal_name: 'Preview',
        selected_gender: 'female',
        updated_at: iso,
      },
    ],
    [
      '24_PLAYER_PROGRESS',
      `${userId}|first_journey`,
      {
        user_route_key: `${userId}|first_journey`,
        user_id: userId,
        story_route_id: 'first_journey',
        status: 'completed',
        first_journey_completed: 'TRUE',
        map_unlocked: 'TRUE',
        completed_at: iso,
        updated_at: iso,
      },
    ],
  ])
    await gateway.appendIfAbsent(tab, key, () => row);
}
export async function prepareBirthdayReviewer({
  userId,
  manifestPath = BIRTHDAY_MANIFEST,
  seed = true,
} = {}) {
  assertLocalReview();
  const saved =
    manifestPath && fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      : null;
  userId ??= saved?.userId ?? `manual_review_bday_${Date.now()}`;
  const source = getProductionGatewayOrNull();
  if (!source) throw Error('Backend credential unavailable.');
  if (seed) await seedBirthdayReviewer(source, userId);
  const adminUserId = saved?.adminUserId ?? `admin_bday_review_${Date.now()}`;
  const gateway = createReviewGateway(source, userId, { adminUserId, birthdayOnly: true });
  const now = new Date();
  const manifest =
    saved && Date.parse(saved.expiresAt) > Date.now() + 3600_000
      ? saved
      : {
          userId,
          adminUserId,
          ownerSessionId: `sess_gate_bday_review_${crypto.randomUUID()}`,
          adminSessionId: `sess_admin_bday_review_${crypto.randomUUID()}`,
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 12 * 3600_000).toISOString(),
        };
  for (const [sessionId, id] of [
    [manifest.ownerSessionId, userId],
    [manifest.adminSessionId, adminUserId],
  ])
    await createOrReconcileSession(gateway, {
      sessionId,
      userId: id,
      ip: '127.0.0.1',
      deviceId: 'birthday-isolated-review',
      createdAt: now,
      expiresAt: new Date(manifest.expiresAt),
    });
  if (manifestPath) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
  return { manifest, source, gateway };
}
export async function startBirthdayServer({ manifest, source, port = 5052, birthdayOnly = true }) {
  assertLocalReview();
  source.setTtlSeconds(15);
  const gateway = createReviewGateway(source, manifest.userId, {
    adminUserId: manifest.adminUserId,
    birthdayOnly,
  });
  const backend = createApp({
    getGateway: () => gateway,
    getEnvironment: () => 'local',
    isProduction: () => false,
    birthdayReviewUserId: manifest.userId,
    staticRoot: path.resolve('apps/web/dist'),
  });
  const server = http.createServer((req, res) => {
    res.setHeader('X-Review-Player', manifest.userId);
    // No general admin controls or credential login on this dedicated birthday process.
    if (req.url.startsWith('/api/admin') || req.url.startsWith('/api/auth/admin')) {
      res.writeHead(404);
      res.end();
      return;
    }
    backend(req, res);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}`, gateway };
}
export async function reviewRequest(origin, manifest, route, { admin = false, body } = {}) {
  const response = await fetch(`${origin}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: admin
        ? `vw_admin_session=${manifest.adminSessionId}`
        : `vw_owner_session=${manifest.ownerSessionId}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.headers.get('X-Review-Player') !== manifest.userId)
    throw Error('Wrong review server/identity; request refused.');
  if (!response.ok) throw Error(`Review request ${route} failed (${response.status}).`);
  return response.json();
}
export async function setBirthdayScenario(origin, manifest, name) {
  const state = await reviewRequest(origin, manifest, '/api/world/birthday');
  const target = Date.parse(state.targetAt),
    end = Date.parse(state.endAt);
  const instants = {
    before: target - 86400_000,
    final20: target - 20000,
    live: target + 3600_000,
    'late-arrival': end + 3600_000,
    replay: target + 3600_000,
    'countdown-only': target + 3600_000,
  };
  if (name !== 'clear' && !(name in instants)) throw Error('Unknown birthday scenario.');
  await reviewRequest(origin, manifest, '/api/dev/birthday-test-clock', {
    admin: true,
    body: { offsetMs: name === 'clear' ? null : instants[name] - Date.now() },
  });
  if (name === 'replay' || name === 'countdown-only')
    for (const route of ['accept', 'gifts/claim', 'complete'])
      await reviewRequest(origin, manifest, `/api/world/birthday/${route}`, { body: {} });
  console.log(`Birthday ${manifest.userId}: ${name}. Ordinary time unchanged.`);
}
