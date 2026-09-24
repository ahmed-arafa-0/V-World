import fs from 'node:fs';
import { createGoogleSheetsClientOrNull } from '../apps/functions/lib/google/client-factory.js';
import { resetReviewPlayer } from './review-support/reset-review-player.mjs';
const manifestPath = 'test-results/review-repair/fresh-review.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const result = await resetReviewPlayer(createGoogleSheetsClientOrNull(), manifest.userId);
fs.writeFileSync(
  manifestPath,
  JSON.stringify(
    { ...manifest, resetAt: new Date().toISOString(), resetBackup: result.backup },
    null,
    2,
  ),
);
