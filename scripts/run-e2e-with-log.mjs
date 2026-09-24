#!/usr/bin/env node
/**
 * Runs the Playwright e2e suite while also writing everything it prints to
 * a log file — without ever going through a shell pipe/`tee`. Piping a
 * native command's output through `tee` (in PowerShell or a POSIX shell
 * without `pipefail`) makes the pipeline's reported exit code reflect
 * `tee`'s own success, not Playwright's, so a real test failure can be
 * masked and reported as exit 0. Spawning the child process directly and
 * calling `process.exit()` with its real exit code sidesteps that shell
 * behavior entirely, on every platform.
 *
 * Usage: node scripts/run-e2e-with-log.mjs [log-file] [-- <playwright args>]
 *   node scripts/run-e2e-with-log.mjs                        // logs to e2e-logs/e2e-run.log
 *   node scripts/run-e2e-with-log.mjs my.log -- tests/e2e/gate.spec.ts --project=desktop-chromium
 *
 * The log path deliberately does NOT default into `test-results/` —
 * Playwright's default `outputDir` is that same folder, and it clears it at
 * the start of every real run, silently wiping a log file placed there out
 * from under this script's own open write handle.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
let logPath = 'e2e-logs/e2e-run.log';
let playwrightArgs = args;

if (args[0] && !args[0].startsWith('-') && args[0] !== '--') {
  logPath = args[0];
  playwrightArgs = args.slice(1);
}
if (playwrightArgs[0] === '--') {
  playwrightArgs = playwrightArgs.slice(1);
}

const resolvedLogPath = resolve(logPath);
mkdirSync(dirname(resolvedLogPath), { recursive: true });
const logStream = createWriteStream(resolvedLogPath, { flags: 'w' });

// `shell: true` runs "npx playwright test ..." as a single shell command
// (not a pipeline), so the child's real exit code is still what `close`
// reports — this only works around `npx` being a .cmd shim on Windows,
// which `spawn()` cannot exec directly without a shell.
const child = spawn('npx', ['playwright', 'test', ...playwrightArgs], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
});

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  logStream.write(chunk);
});
child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  logStream.write(chunk);
});

child.on('error', (err) => {
  logStream.end();
  console.error(err);
  process.exit(1);
});

child.on('close', (code, signal) => {
  logStream.end(() => {
    if (signal) {
      console.error(`Playwright was terminated by signal ${signal}`);
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
});
