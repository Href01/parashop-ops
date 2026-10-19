#!/usr/bin/env node
/**
 * Smoke check de l'authentification GitHub/Vercel des runs agents.
 *
 * Le script est en LECTURE SEULE : il ne deploie rien, ne modifie aucun depot
 * et ne lit jamais le contenu des fichiers de credentials. Il ne doit jamais
 * afficher de token, meme masque par le CLI.
 *
 * Contexte et procedure de reparation : docs/AGENT_AUTH_RUNBOOK.md.
 *
 * Lancer : node scripts/agent-auth-smoke.mjs
 * Tests  : node --test tests/agent-auth-smoke.test.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_REPO = 'Href01/parashop-ops';
const DOC_PATH = 'docs/AGENT_AUTH_RUNBOOK.md';
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const TOKEN_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{20,})\b/g;

/** Masque tout token qui aurait echappe au CLI. */
export function sanitize(text) {
  return String(text ?? '')
    .replace(TOKEN_PATTERN, '***')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 ***');
}

/** Candidats de configuration gh, du plus explicite au defaut de la plateforme. */
export function ghConfigCandidates({ platform = process.platform, env = process.env } = {}) {
  const candidates = [];
  if (env.GH_CONFIG_DIR) candidates.push(env.GH_CONFIG_DIR);
  if (platform === 'win32') {
    if (env.APPDATA) candidates.push(join(env.APPDATA, 'GitHub CLI'));
  } else {
    if (env.XDG_CONFIG_HOME) candidates.push(join(env.XDG_CONFIG_HOME, 'gh'));
    candidates.push(join(env.HOME || homedir(), '.config', 'gh'));
  }
  return [...new Set(candidates)];
}

/** Premier dossier gh contenant hosts.yml, ou null. */
export function resolveGhConfigDir(options = {}) {
  const { exists = existsSync } = options;
  return ghConfigCandidates(options).find((dir) => exists(join(dir, 'hosts.yml'))) ?? null;
}

/** Candidats de configuration Vercel, du plus explicite au defaut de la plateforme. */
export function vercelConfigCandidates({ platform = process.platform, env = process.env } = {}) {
  const candidates = [];
  // Le CLI honore XDG_DATA_HOME quand il est defini (sandbox Paperclip).
  if (env.XDG_DATA_HOME) candidates.push(join(env.XDG_DATA_HOME, 'com.vercel.cli'));
  if (platform === 'win32') {
    if (env.APPDATA) candidates.push(join(env.APPDATA, 'com.vercel.cli', 'Data'));
  } else {
    candidates.push(join(env.HOME || homedir(), '.local', 'share', 'com.vercel.cli'));
  }
  return [...new Set(candidates)];
}

/** Premier dossier Vercel contenant auth.json, ou null. */
export function resolveVercelConfigDir(options = {}) {
  const { exists = existsSync } = options;
  return vercelConfigCandidates(options).find((dir) => exists(join(dir, 'auth.json'))) ?? null;
}

function errorOutput(error) {
  const parts = [error?.stdout, error?.stderr]
    .map((part) => (part === undefined || part === null ? '' : String(part)))
    .filter((part) => part.trim().length > 0);
  return parts.join('\n').trim() || String(error?.message ?? '');
}

/**
 * Execute une commande en capturant stdout/stderr. Sous Windows, passe par
 * cmd.exe pour resoudre les shims npm (vercel.cmd). Les arguments sont fixes
 * ou valides (repo) : aucune entree libre n'est injectee dans la ligne.
 */
export function runCommand(command, args, { env = process.env, timeout = 30_000 } = {}) {
  try {
    const stdout = process.platform === 'win32'
      ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')], {
          encoding: 'utf8',
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout,
          windowsHide: true,
        })
      : execFileSync(command, args, {
          encoding: 'utf8',
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout,
        });
    return { ok: true, status: 0, output: sanitize(stdout).trim() };
  } catch (error) {
    return {
      ok: false,
      status: typeof error?.status === 'number' ? error.status : null,
      output: sanitize(errorOutput(error)),
    };
  }
}

function checkGh(repo) {
  const configDir = resolveGhConfigDir();
  const env = { ...process.env, GH_PAGER: 'cat', NO_COLOR: '1' };
  if (configDir) env.GH_CONFIG_DIR = configDir;

  const status = runCommand('gh', ['auth', 'status'], { env });
  if (!status.ok) {
    return {
      ok: false,
      reason: configDir
        ? `gh auth status a echoue (config: ${configDir})`
        : 'gh auth status a echoue et aucun hosts.yml trouve',
    };
  }

  const account = status.output.match(/Logged in to \S+ account (\S+)/i)?.[1] ?? 'compte inconnu';
  const scopes = status.output.match(/Token scopes:\s*(.+)/i)?.[1]?.trim() ?? 'inconnus';

  const list = runCommand('gh', [
    'pr', 'list', '--repo', repo, '--limit', '1', '--json', 'number,title,state',
  ], { env });
  if (!list.ok) {
    return { ok: false, reason: `lecture des PR impossible sur ${repo}`, detail: list.output };
  }

  let sample = 'aucune PR (lecture OK)';
  try {
    const pulls = JSON.parse(list.output);
    if (Array.isArray(pulls) && pulls.length > 0) {
      sample = `PR #${pulls[0].number} ${pulls[0].state} - ${pulls[0].title}`;
    }
  } catch {
    sample = 'lecture OK (sortie JSON non interpretable)';
  }

  return { ok: true, account, scopes, sample };
}

async function githubApiFallback(repo) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/pulls?per_page=1&state=all`,
      {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'shine-agent-auth-smoke',
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      return { ok: false, reason: `API GitHub publique -> HTTP ${response.status}` };
    }
    const pulls = await response.json();
    const sample = Array.isArray(pulls) && pulls.length > 0 ? `PR #${pulls[0].number}` : 'aucune PR';
    return { ok: true, sample };
  } catch (error) {
    return { ok: false, reason: `API GitHub publique -> ${sanitize(error?.message)}` };
  }
}

function checkVercel() {
  const configDir = resolveVercelConfigDir();
  const env = { ...process.env, NO_COLOR: '1' };
  const xdgConfigDir = process.env.XDG_DATA_HOME
    ? join(process.env.XDG_DATA_HOME, 'com.vercel.cli')
    : null;
  // Le runner Paperclip impose XDG_DATA_HOME vers un sandbox : si les credentials
  // ne sont pas dedans, on retire la variable pour que Vercel lise APPDATA.
  if (configDir !== xdgConfigDir) delete env.XDG_DATA_HOME;

  const result = runCommand('vercel', ['whoami', '--no-color'], { env });
  if (!result.ok || /logged out/i.test(result.output)) {
    return {
      ok: false,
      reason: configDir
        ? `vercel whoami -> non connecte (config: ${configDir})`
        : 'vercel whoami -> non connecte et aucun auth.json trouve',
    };
  }

  const login = result.output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop() ?? 'inconnu';
  return { ok: true, login };
}

function usage() {
  return [
    'Usage :',
    '  node scripts/agent-auth-smoke.mjs [options]',
    '',
    'Options :',
    `  --repo <owner/name>   depot dont on verifie la lecture des PR (defaut: ${DEFAULT_REPO})`,
    '  --github-only          ne verifie que GitHub',
    '  --vercel-only          ne verifie que Vercel',
    '  --no-fallback          pas de repli API GitHub publique si gh echoue',
    '  --strict               exit 1 si gh est en repli (sinon simple WARN)',
    '  -h, --help             affiche cette aide',
    '',
    'Codes retour : 0 OK (ou repli en mode non strict), 1 auth/acces en echec, 2 usage/environnement.',
    '',
    `Procedure et rollback : ${DOC_PATH}`,
  ].join('\n');
}

export function parseArgs(argv = []) {
  const options = {
    repo: DEFAULT_REPO,
    githubOnly: false,
    vercelOnly: false,
    fallback: true,
    strict: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--github-only') {
      options.githubOnly = true;
      continue;
    }
    if (arg === '--vercel-only') {
      options.vercelOnly = true;
      continue;
    }
    if (arg === '--no-fallback') {
      options.fallback = false;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--repo') {
      const value = argv[index + 1];
      if (!value) throw new Error(`--repo attend une valeur owner/name\n\n${usage()}`);
      options.repo = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--repo=')) {
      options.repo = arg.slice('--repo='.length);
      continue;
    }
    throw new Error(`Argument inconnu : ${arg}\n\n${usage()}`);
  }
  if (options.githubOnly && options.vercelOnly) {
    throw new Error('--github-only et --vercel-only sont exclusifs');
  }
  if (!REPO_PATTERN.test(options.repo)) {
    throw new Error(`Depot invalide : ${options.repo} (attendu owner/name)`);
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  let failed = false;

  if (!options.vercelOnly) {
    const gh = checkGh(options.repo);
    if (gh.ok) {
      console.log(`[PASS] GitHub : connecte (${gh.account}), scopes ${gh.scopes}`);
      console.log(`[PASS] GitHub : lecture ${options.repo} -> ${gh.sample}`);
    } else {
      console.error(`[FAIL] GitHub : ${gh.reason}${gh.detail ? `\n${gh.detail}` : ''}`);
      let recovered = false;
      if (options.fallback) {
        const fallback = await githubApiFallback(options.repo);
        if (fallback.ok) {
          recovered = true;
          console.warn(`[WARN] GitHub : repli API publique en lecture seule -> ${fallback.sample}`);
          console.warn('[WARN] GitHub : reparer gh avant une revue qui exige les checks/PR (voir le runbook).');
        } else {
          console.error(`[FAIL] GitHub : ${fallback.reason}`);
        }
      }
      if (!recovered || options.strict) failed = true;
    }
  }

  if (!options.githubOnly) {
    const vercel = checkVercel();
    if (vercel.ok) {
      console.log(`[PASS] Vercel : connecte (${vercel.login})`);
    } else {
      console.error(`[FAIL] Vercel : ${vercel.reason}`);
      failed = true;
    }
  }

  if (failed) {
    console.error(`\nEchec. Procedure, commandes exactes et rollback : ${DOC_PATH}`);
    return 1;
  }
  console.log('\nOK : authentification agent utilisable en lecture seule.');
  return 0;
}

const isMain = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(String(error?.message ?? error));
      process.exitCode = 2;
    },
  );
}
