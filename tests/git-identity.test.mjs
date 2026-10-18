/**
 * Tests de scripts/check-git-identity.mjs sur des depots git temporaires.
 *
 * Lancer : node --test tests/git-identity.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, '..', 'scripts', 'check-git-identity.mjs');

const ALLOWED = { name: 'Platform & DevOps', email: 'mekouar01@gmail.com' };
const AGENTS = { name: 'Site Engineer (Paperclip)', email: 'agents@shinecosmetics.ma' };
const GLOVO = { name: 'Achraf Mekouar', email: 'achraf.mekouar@glovoapp.com' };

function git(cwd, args, extraEnv = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...extraEnv },
  }).trim();
}

function makeRepo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'git-identity-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.name', ALLOWED.name]);
  git(dir, ['config', 'user.email', ALLOWED.email]);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  return dir;
}

function commit(dir, message, who) {
  appendFileSync(join(dir, 'history.txt'), `${message}\n`);
  git(dir, ['add', 'history.txt']);
  git(dir, ['commit', '-q', '-m', message], {
    GIT_AUTHOR_NAME: who.name,
    GIT_AUTHOR_EMAIL: who.email,
    GIT_COMMITTER_NAME: who.name,
    GIT_COMMITTER_EMAIL: who.email,
  });
  return git(dir, ['rev-parse', 'HEAD']);
}

function run(dir, args = []) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
}

function output(result) {
  return `${result.stdout || ''}${result.stderr || ''}`;
}

test('email autorise sur HEAD -> exit 0', (t) => {
  const dir = makeRepo(t);
  commit(dir, 'chore: commit autorise', ALLOWED);

  const result = run(dir);

  assert.equal(result.status, 0, output(result));
  assert.match(result.stdout, /conforme/i);
});

test('auteur/committer agents@shinecosmetics.ma -> exit 1', (t) => {
  const dir = makeRepo(t);
  commit(dir, 'feat: commit agent', AGENTS);

  const result = run(dir);

  assert.equal(result.status, 1);
  assert.match(output(result), /agents@shinecosmetics\.ma/);
  assert.match(output(result), /non conforme/i);
  assert.match(output(result), /git commit --allow-empty/);
});

test('auteur/committer achraf.mekouar@glovoapp.com -> exit 1', (t) => {
  const dir = makeRepo(t);
  commit(dir, 'feat: commit glovo', GLOVO);

  const result = run(dir);

  assert.equal(result.status, 1);
  assert.match(output(result), /achraf\.mekouar@glovoapp\.com/);
  assert.match(output(result), /non conforme/i);
});

test('--range avec un commit intermediaire fautif -> exit 1', (t) => {
  const dir = makeRepo(t);
  commit(dir, 'chore: base autorisee', ALLOWED);
  git(dir, ['switch', '-q', '-c', 'feature']);
  const badSha = commit(dir, 'feat: commit fautif', AGENTS);
  commit(dir, 'feat: commit de tete autorise', ALLOWED);

  const headOnly = run(dir);
  assert.equal(headOnly.status, 0, output(headOnly));

  const result = run(dir, ['--range=main..HEAD']);

  assert.equal(result.status, 1);
  assert.match(output(result), new RegExp(badSha.slice(0, 7)));
  assert.match(output(result), /agents@shinecosmetics\.ma/);
  assert.match(output(result), /auteur/);
});

test('--range avec tous les commits autorises -> exit 0', (t) => {
  const dir = makeRepo(t);
  commit(dir, 'chore: base autorisee', ALLOWED);
  git(dir, ['switch', '-q', '-c', 'feature']);
  commit(dir, 'feat: suite autorisee', ALLOWED);

  const result = run(dir, ['--range=main..HEAD']);

  assert.equal(result.status, 0, output(result));
  assert.match(result.stdout, /conforme/i);
});
