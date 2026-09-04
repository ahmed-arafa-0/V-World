#!/usr/bin/env node
/**
 * Fails the build if the frontend bundle contains any trace of backend-only
 * credential material or a reference to the backend's private config folder.
 * Run after `apps/web` has been built (dist/ must exist).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(dirname, '..');
const distDir = path.join(repoRoot, 'apps', 'web', 'dist');

const FORBIDDEN_PATTERNS = [
  'google-service-account.json',
  'config-private',
  'private_key',
  'private_key_id',
  'BEGIN PRIVATE KEY',
  'GEMINI_API_KEY',
  '@veoullas-world/functions',
];

const SCANNABLE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.map',
  '.json',
  '.txt',
]);

function collectFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    return statSync(fullPath).isDirectory() ? collectFiles(fullPath) : [fullPath];
  });
}

function main() {
  if (!statSyncSafe(distDir)) {
    console.error(`[security-boundary-scan] Build output not found at ${distDir}.`);
    console.error('Run "npm run build --workspace=apps/web" before this scan.');
    process.exit(1);
  }

  const files = collectFiles(distDir).filter((file) =>
    SCANNABLE_EXTENSIONS.has(path.extname(file).toLowerCase()),
  );

  if (files.length === 0) {
    console.error('[security-boundary-scan] No scannable files found in the build output.');
    process.exit(1);
  }

  const violations = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (content.includes(pattern)) {
        violations.push({ file: path.relative(repoRoot, file), pattern });
      }
    }
  }

  if (violations.length > 0) {
    console.error(
      '[security-boundary-scan] FAILED — forbidden content found in the frontend bundle:',
    );
    for (const { file, pattern } of violations) {
      console.error(`  - "${pattern}" found in ${file}`);
    }
    process.exit(1);
  }

  console.log(
    `[security-boundary-scan] PASSED — scanned ${files.length} file(s) in apps/web/dist, no forbidden credential references found.`,
  );
}

function statSyncSafe(target) {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

main();
