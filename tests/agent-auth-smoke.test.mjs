/**
 * Tests de scripts/agent-auth-smoke.mjs.
 *
 * Lancer : node --test tests/agent-auth-smoke.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveGhConfigDir,
  resolveVercelConfigDir,
  sanitize,
} from '../scripts/agent-auth-smoke.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '..', 'scripts', 'agent-auth-smoke.mjs');
const SECRET = 'gho_SUPERSECRETTOKEN123456789';

test('sanitize masque les tokens GitHub et Bearer', () => {
  const input = `token ${SECRET} github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 Bearer abc.def`;
  const output = sanitize(input);

  assert.doesNotMatch(output, /SUPERSECRET/);
  assert.doesNotMatch(output, /github_pat_/);
  assert.doesNotMatch(output, /Bearer abc\.def/);
  assert.match(output, /\*\*\*/);
});

test('gh : GH_CONFIG_DIR invalide -> repli sur APPDATA/GitHub CLI', () => {
  const appData = join('C:', 'Users', 'agent', 'AppData', 'Roaming');
  const expected = join(appData, 'GitHub CLI');

  const found = resolveGhConfigDir({
    platform: 'win32',
    env: { GH_CONFIG_DIR: join('C:', 'missing'), APPDATA: appData },
    exists: (path) => path === join(expected, 'hosts.yml'),
  });

  assert.equal(found, expected);
});

test('gh : aucun hosts.yml -> null', () => {
  const found = resolveGhConfigDir({
    platform: 'win32',
    env: { APPDATA: join('C:', 'Users', 'agent', 'AppData', 'Roaming') },
    exists: () => false,
  });

  assert.equal(found, null);
});

test('vercel : trouve auth.json dans APPDATA/com.vercel.cli/Data', () => {
  const appData = join('C:', 'Users', 'agent', 'AppData', 'Roaming');
  const expected = join(appData, 'com.vercel.cli', 'Data');

  const found = resolveVercelConfigDir({
    platform: 'win32',
    env: { APPDATA: appData },
    exists: (path) => path === join(expected, 'auth.json'),
  });

  assert.equal(found, expected);
});

test('vercel : priorite a XDG_DATA_HOME quand auth.json y est', () => {
  const appData = join('C:', 'Users', 'agent', 'AppData', 'Roaming');
  const xdgData = join('C:', 'Users', 'agent', 'AppData', 'Local', 'Temp', 'sandbox');
  const expected = join(xdgData, 'com.vercel.cli');

  const found = resolveVercelConfigDir({
    platform: 'win32',
    env: { APPDATA: appData, XDG_DATA_HOME: xdgData },
    exists: (path) => path === join(expected, 'auth.json'),
  });

  assert.equal(found, expected);
});

function writeFake(bin, name, body) {
  if (process.platform === 'win32') {
    writeFileSync(join(bin, `${name}.cmd`), `@echo off\r\n${body}\r\n`);
    return;
  }
  const path = join(bin, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

function ghBody(ok) {
  if (!ok) {
    return process.platform === 'win32'
      ? 'echo You are not logged into any GitHub hosts. 1>&2\r\nexit /b 1'
      : "echo 'You are not logged into any GitHub hosts.' >&2\nexit 1";
  }
  if (process.platform === 'win32') {
    return [
      'if "%1"=="auth" (',
      '  echo github.com',
      '  echo   - Logged in to github.com account fake-user',
      `  echo   - Token: ${SECRET}`,
      "  echo   - Token scopes: 'repo', 'workflow'",
      '  exit /b 0',
      ')',
      'if "%1"=="pr" (',
      '  echo [{"number":42,"title":"fake","state":"OPEN"}]',
      '  exit /b 0',
      ')',
      'exit /b 1',
    ].join('\r\n');
  }
  return [
    'case "$1" in',
    '  auth)',
    '    echo "github.com"',
    '    echo "  - Logged in to github.com account fake-user"',
    `    echo "  - Token: ${SECRET}"`,
    `    echo "  - Token scopes: 'repo', 'workflow'"`,
    '    ;;',
    '  pr)',
    `    echo '[{"number":42,"title":"fake","state":"OPEN"}]'`,
    '    ;;',
    '  *) exit 1 ;;',
    'esac',
  ].join('\n');
}

function vercelBody(ok) {
  if (!ok) {
    return process.platform === 'win32'
      ? 'echo Logged out.\r\nexit /b 1'
      : 'echo Logged out.\nexit 1';
  }
  return process.platform === 'win32'
    ? 'echo fake-vercel-user\r\nexit /b 0'
    : 'echo fake-vercel-user';
}

function makeFakeEnvironment(t, { ghOk, vercelOk }) {
  const root = mkdtempSync(join(tmpdir(), 'agent-auth-smoke-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const bin = join(root, 'bin');
  const ghConfig = join(root, 'gh-config');
  const appData = join(root, 'appdata');
  const vercelData = join(appData, 'com.vercel.cli', 'Data');

  mkdirSync(bin, { recursive: true });
  mkdirSync(ghConfig, { recursive: true });
  mkdirSync(vercelData, { recursive: true });
  writeFileSync(join(ghConfig, 'hosts.yml'), 'github.com:\n  user: fake\n');
  writeFileSync(join(vercelData, 'auth.json'), '{}\n');

  writeFake(bin, 'gh', ghBody(ghOk));
  writeFake(bin, 'vercel', vercelBody(vercelOk));

  return { bin, ghConfig, appData };
}

function runScript(fake) {
  return spawnSync(process.execPath, [SCRIPT, '--no-fallback'], {
    cwd: HERE,
    encoding: 'utf8',
    env: {
      ...process.env,
      GH_CONFIG_DIR: fake.ghConfig,
      APPDATA: fake.appData,
      PATH: `${fake.bin}${delimiter}${process.env.PATH ?? ''}`,
    },
  });
}

test('run OK : gh et vercel joignables, aucun token affiche', (t) => {
  const fake = makeFakeEnvironment(t, { ghOk: true, vercelOk: true });
  const result = runScript(fake);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /\[PASS\] GitHub/);
  assert.match(output, /PR #42/);
  assert.match(output, /\[PASS\] Vercel/);
  assert.doesNotMatch(output, /SUPERSECRET/);
  assert.doesNotMatch(output, /gho_/);
});

test('run KO : gh et vercel en echec -> exit 1, aucune fuite', (t) => {
  const fake = makeFakeEnvironment(t, { ghOk: false, vercelOk: false });
  const result = runScript(fake);
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 1, output);
  assert.match(output, /\[FAIL\] GitHub/);
  assert.match(output, /\[FAIL\] Vercel/);
  assert.doesNotMatch(output, /SUPERSECRET/);
});
