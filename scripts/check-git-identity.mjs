#!/usr/bin/env node
/**
 * Preflight identite git.
 *
 * Verifie que l'auteur ET le committer sont mekouar01@gmail.com, seul email
 * autorise par le compte Vercel de Shine Cosmetics. Par defaut, controle le
 * commit de tete (HEAD) ; --range controle tous les commits d'une plage.
 *
 * Le script est en lecture seule : il ne modifie ni l'historique ni le remote.
 *
 * Voir docs/GIT_IDENTITY.md pour la procedure de reparation et l'activation
 * du hook .githooks/pre-push.
 */
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const ALLOWED_EMAIL = 'mekouar01@gmail.com';
const DOC_PATH = 'docs/GIT_IDENTITY.md';
const FIELD_FORMAT = '%H%x09%ae%x09%ce%x09%an%x09%cn';

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function die(message, code) {
  console.error(message);
  process.exit(code);
}

function usage() {
  return [
    'Usage :',
    '  node scripts/check-git-identity.mjs                 # verifie HEAD (auteur + committer)',
    '  node scripts/check-git-identity.mjs --range         # verifie origin/main..HEAD',
    '  node scripts/check-git-identity.mjs --range=<plage> # verifie <plage> (ex. main..HEAD)',
    '',
    `Email autorise : ${ALLOWED_EMAIL}`,
    "Codes retour : 0 conforme, 1 non conforme, 2 erreur d'environnement ou d'usage.",
  ].join('\n');
}

function parseArgs(argv) {
  let range = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--range') {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        range = next;
        i += 1;
      } else {
        range = 'origin/main..HEAD';
      }
      continue;
    }
    if (arg.startsWith('--range=')) {
      range = arg.slice('--range='.length) || 'origin/main..HEAD';
      continue;
    }
    die(`Argument inconnu : ${arg}\n\n${usage()}`, 2);
  }
  if (range && (range.startsWith('-') || /\s/.test(range))) {
    die(`Plage invalide : ${range}\n\n${usage()}`, 2);
  }
  return { range };
}

function assertGitRepo() {
  try {
    git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    die('Erreur : ce script doit etre lance depuis un depot git.', 2);
  }
}

function parseLog(raw) {
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, authorEmail, committerEmail, authorName, committerName] = line.split('\t');
      return { sha, authorEmail, committerEmail, authorName, committerName };
    });
}

function listCommits(range) {
  if (!range) {
    const raw = git(['log', '-1', `--format=${FIELD_FORMAT}`, 'HEAD']);
    return parseLog(raw);
  }

  const base = range.split('..')[0];
  if (!base) {
    die(`Erreur : plage invalide "${range}". Fournir --range=<base>..HEAD.`, 2);
  }
  try {
    git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]);
  } catch {
    die(
      `Erreur : la base de la plage "${range}" est introuvable (origin/main absent ou fetch manquant ?).\n` +
        'Fournir explicitement --range=<base>..HEAD.',
      2,
    );
  }

  try {
    const raw = git(['log', `--format=${FIELD_FORMAT}`, range]);
    return parseLog(raw);
  } catch (error) {
    const detail = String(error.stderr || error.message || '').trim();
    die(`Erreur : plage invalide "${range}".\n${detail}`, 2);
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function collectViolations(commits) {
  const violations = [];
  for (const commit of commits) {
    if (normalizeEmail(commit.authorEmail) !== ALLOWED_EMAIL) {
      violations.push({ ...commit, role: 'auteur', email: commit.authorEmail, name: commit.authorName });
    }
    if (normalizeEmail(commit.committerEmail) !== ALLOWED_EMAIL) {
      violations.push({ ...commit, role: 'committer', email: commit.committerEmail, name: commit.committerName });
    }
  }
  return violations;
}

function shortSha(sha) {
  return String(sha || '').slice(0, 7);
}

function printFailure(violations, commits, range) {
  const lines = [];
  lines.push('ECHEC — identite git non conforme.');
  lines.push('');
  lines.push(
    `${violations.length} champ(s) fautif(s) sur ${commits.length} commit(s) controle(s) ` +
      `(${range ? `plage ${range}` : 'HEAD'}).`,
  );
  lines.push('');
  for (const violation of violations) {
    lines.push(
      `  ${shortSha(violation.sha)}  ${violation.role.padEnd(9)} ${violation.name || '(nom absent)'} <${violation.email}>`,
    );
  }
  lines.push('');
  lines.push(`Seul l'email ${ALLOWED_EMAIL} est autorise (auteur ET committer).`);
  lines.push(`Procedure complete : ${DOC_PATH}`);
  lines.push('');
  lines.push('Correction (sans jamais reecrire une PR ouverte ni force-push) :');
  lines.push('  git config --local user.email mekouar01@gmail.com');
  lines.push('  git config --local user.name "<nom d\'agent>"');
  lines.push('');
  lines.push('  # Commit de tete jamais pousse :');
  lines.push('  git commit --amend --no-edit --reset-author');
  lines.push('');
  lines.push('  # Branche deja poussee / PR ouverte (Vercel ne controle que le commit de tete) :');
  lines.push('  git commit --allow-empty -m "chore: relance build Vercel avec identite autorisee"');
  lines.push('  git push');
  if (range) {
    lines.push('');
    lines.push(
      'Note : les commits anciens de la plage restent fautifs et ne doivent pas etre reecrits ; ' +
        'le commit vide autorise en tete suffit a debloquer le build.',
    );
  }
  console.error(lines.join('\n'));
}

function printSuccess(commits, range) {
  const scope = range ? `plage ${range}` : `HEAD ${shortSha(commits[0]?.sha)}`;
  console.log(
    `OK — identite git conforme sur ${scope} (${commits.length} commit(s)) : ` +
      `auteur et committer = ${ALLOWED_EMAIL}.`,
  );
}

const { range } = parseArgs(process.argv.slice(2));
assertGitRepo();

const commits = listCommits(range);
const violations = collectViolations(commits);

if (violations.length > 0) {
  printFailure(violations, commits, range);
  process.exit(1);
}

printSuccess(commits, range);
