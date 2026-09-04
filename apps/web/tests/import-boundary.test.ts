import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(dirname, '..', 'src');

const FORBIDDEN_PATTERNS = [
  'google-service-account.json',
  'config-private',
  'private_key',
  'private_key_id',
  'BEGIN PRIVATE KEY',
  'client_email',
  'gate_code_plaintext',
  'admin_password_plaintext',
  'plaintext_value',
  'AUTHORIZATION_KEY',
  '@veoullas-world/functions',
];

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    return statSync(fullPath).isDirectory() ? collectFiles(fullPath) : [fullPath];
  });
}

describe('frontend private-config import boundary', () => {
  const files = collectFiles(srcDir);

  it('scanned at least one frontend source file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s contains no backend-only credential references', (filePath) => {
    const content = readFileSync(filePath, 'utf-8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(content).not.toContain(pattern);
    }
  });
});
