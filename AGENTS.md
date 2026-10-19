<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Identité git obligatoire

- Auteur **et** committer de chaque commit : `mekouar01@gmail.com`. Le nom d'agent est conservé (ex. `Platform & DevOps`, `Release Manager`).
- Ajoute le trailer `Agent: <nom>` dans le message de commit.
- Avant tout push : `npm run verify:git-identity` (HEAD) et, pour un audit complet, `node scripts/check-git-identity.mjs --range`.
- Hook fourni mais **non activé** : `.githooks/pre-push`. Activation = accord d'Achraf via la PR (`git config --local core.hooksPath .githooks`).
- Jamais de réécriture d'une PR ouverte, jamais de force-push. Réparation = commit vide autorisé en tête de branche.
- Procédure complète, activation et rollback : `docs/GIT_IDENTITY.md`.

## Auth GitHub/Vercel des runs agents

- GitHub : sur cette machine, `%USERPROFILE%\.config\gh` est un junction vers
  `%APPDATA%\GitHub CLI`. `gh` est donc authentifié sans `gh auth login` dans un run.
  Ne pas recréer ni supprimer ce lien sans lire le runbook.
- Avant de livrer ou de revendiquer un check : `npm run verify:agent-auth`
  (lecture seule ; n'affiche jamais de token).
- Vercel : le runner impose `XDG_DATA_HOME` vers un sandbox, donc `vercel whoami`
  peut répondre `Logged out`. Utiliser
  `vercel --global-config "$env:APPDATA\com.vercel.cli\Data" <commande>`.
- Si `gh` échoue : repli lecture seule sur l'API GitHub publique
  (`https://api.github.com/repos/<owner>/<repo>/pulls`, repos publics), signaler le
  `WARN`, et ne pas conclure sans vérification.
- Revue / Kodo : lecture seule uniquement (pas de merge, deploy ni mutation de PR).
  Ne jamais afficher `gh auth token`, `hosts.yml`, `auth.json` ou `VERCEL_TOKEN`.
- Procédure complète, preuves et rollback : `docs/AGENT_AUTH_RUNBOOK.md`.
