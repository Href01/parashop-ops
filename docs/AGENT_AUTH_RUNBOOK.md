# Runbook - Authentification GitHub/Vercel des runs agents

- **Date** : 2026-10-19
- **Contexte** : Paperclip `2026.1012.0`, runs locaux Windows, repos `parashop` et `parashop-ops`.
- **Statut** : correctif GitHub applique sur la machine d'Achraf ; smoke check livre dans ce depot.
- **Regle** : ce runbook ne declenche aucun deploiement, aucune migration et aucune ecriture GitHub.

## 1. Symptomes

- Un run agent neuf execute `gh pr list` -> `To get started with GitHub CLI, please run gh auth login`.
- `gh auth status` echoue alors que le compte `Href01` est bien connecte sur la machine.
- `vercel whoami` -> `Logged out` alors que `auth.json` existe.
- Les agents perdent du temps a chercher le bon dossier, ou acceptent des preuves non verifiables.

## 2. Cause racine

### GitHub

Le runner Paperclip derive `GH_CONFIG_DIR` depuis `XDG_CONFIG_HOME` ou `HOME` :

```
$HOME/.config/gh
```

(`@paperclipai/adapter-utils/dist/execution-target.js`, fonction de preparation de
l'environnement Git, Paperclip `2026.1012.0`.)

Sur Windows, GitHub CLI stocke sa configuration dans :

```
%APPDATA%\GitHub CLI\hosts.yml
```

Le dossier derive `.config\gh` n'existe pas : `gh` demarre donc sans credentials,
meme si `hostCredentials` est actif.

### Vercel

Le runner impose `XDG_DATA_HOME` vers un dossier sandbox propre a chaque run. Le CLI
Vercel (via `xdg-app-paths`) cherche alors :

```
$XDG_DATA_HOME\com.vercel.cli
```

alors que les credentials reelles sont dans :

```
%APPDATA%\com.vercel.cli\Data\auth.json
```

D'ou le `Logged out` alors que la machine est connectee.

## 3. Correctif applique - GitHub (machine d'Achraf)

Un **junction** fait pointer le chemin derive vers le vrai dossier, sans copier ni
afficher le token :

```powershell
$link   = "$env:USERPROFILE\.config\gh"
$target = "$env:APPDATA\GitHub CLI"
if (-not (Test-Path -LiteralPath $link)) {
  New-Item -ItemType Junction -Path $link -Target $target | Out-Null
}
```

Verification (lecture seule) :

```powershell
gh auth status
gh pr list --repo Href01/parashop-ops --limit 3
```

Resultat attendu : `Logged in to github.com account Href01` puis la liste des PR.

Rollback (supprime le lien, **pas** le dossier cible) :

```powershell
cmd /c rmdir "$env:USERPROFILE\.config\gh"
```

Alternative durable cote plateforme (decision Achraf) : exposer
`GH_CONFIG_DIR=%APPDATA%\GitHub CLI` dans l'environnement du serveur Paperclip, puis
redemarrer Paperclip. Le junction evite ce redemarrage.

## 4. Correctif Vercel

Commande recommandee, sans mutation d'environnement :

```powershell
vercel --global-config "$env:APPDATA\com.vercel.cli\Data" whoami
```

Variante equivalente pour une commande ponctuelle (le smoke check le fait deja) :

```powershell
$env:XDG_DATA_HOME = $null
vercel whoami
```

Ne jamais mettre `VERCEL_TOKEN` sur une ligne de commande (visible dans l'historique
et les logs). Si un token est necessaire, il doit etre injecte par les secrets
Paperclip, jamais commite ni affiche.

## 5. Smoke check

```powershell
npm run verify:agent-auth        # gh auth status + lecture d'une PR + vercel whoami
npm run test:agent-auth          # tests hors ligne du script
```

Options utiles :

```text
--repo <owner/name>   depot verifie (defaut Href01/parashop-ops)
--github-only         ne verifie que GitHub
--vercel-only         ne verifie que Vercel
--no-fallback         pas de repli API publique si gh echoue
--strict              exit 1 si gh est en repli (sinon simple WARN)
```

Codes retour : `0` OK (ou repli en mode non strict), `1` auth/acces en echec,
`2` usage/environnement.

Le script ne lit pas `hosts.yml` / `auth.json` et ne peut pas afficher de token :
il ne garde que le compte, les scopes et le login.

## 6. Repli lecture seule GitHub

Si `gh` echoue, les deux repos etant **publics**, l'API GitHub publique permet de
lire l'etat des PR sans token (limite ~60 requetes/heure/IP) :

```powershell
Invoke-RestMethod `
  -Uri "https://api.github.com/repos/Href01/parashop-ops/pulls?per_page=5" `
  -Headers @{ 'User-Agent' = 'shine-agent'; 'Accept' = 'application/vnd.github+json' }
```

Le smoke check tente ce repli automatiquement et affiche `[WARN]`. Ce repli ne donne
pas acces aux checks prives, aux secrets ni aux ecritures : il sert a poursuivre une
verification, pas a remplacer `gh`. Signaler le `WARN` dans la tache.

## 7. Securite

- Ne jamais executer ni logger `gh auth token`, `cat hosts.yml`, `auth.json` ou
  `VERCEL_TOKEN`.
- Le token `gh` actuel a les scopes `gist`, `repo`, `workflow` : il peut ecrire.
  Les agents doivent rester **lecture seule** (`pr view`, `pr list`, `gh api` en GET).
- Kodo : lecture seule obligatoire ; ne pas merger, ne pas deployer, ne pas modifier
  de PR. Pour une garantie technique, Achraf peut fournir un token fine-grained
  lecture seule dedie a Kodo via les secrets Paperclip.
- `read:org` manque sur le token actuel. Non bloquant pour ces deux repos publics ;
  a ajouter par Achraf (`gh auth refresh -h github.com -s read:org`) si un repo
  d'organisation devient necessaire.
- Aucun secret dans un commentaire, un commit ou un log de run.

## 8. Reste a faire (Achraf / plateforme)

- [ ] Decider du correctif durable Paperclip : garder le junction documente, ou
      injecter `GH_CONFIG_DIR` dans l'environnement du serveur.
- [ ] Si `vercel` doit fonctionner sans flag : injecter un token read-only via les
      secrets Paperclip (`VERCEL_TOKEN`, `VERCEL_ORG_ID`), jamais en clair.
- [ ] Fournir un token GitHub lecture seule dedie a Kodo si l'isolation doit etre
      technique et non seulement procedurale.
- [ ] Ajouter `read:org` au token si un repo d'organisation est utilise.
- [ ] Option : dupliquer la section `AGENTS.md` dans le repo `parashop` (site) si
      les agents du site doivent voir la consigne localement.

## 9. Preuves du 2026-10-19

| Verification | Avant | Apres |
| --- | --- | --- |
| `gh auth status` avec `GH_CONFIG_DIR=.config\gh` | non connecte | `Logged in ... account Href01` |
| `gh pr list --repo Href01/parashop-ops` | `gh auth login` requis | PR #1, #2 listees |
| `vercel whoami` (XDG_DATA_HOME sandbox) | `Logged out` | `Logged out` (inchange, utiliser le flag) |
| `vercel --global-config %APPDATA%\com.vercel.cli\Data whoami` | - | `mekouar01-6453` |
| `npm run verify:agent-auth` | - | `[PASS] GitHub`, `[PASS] Vercel` |

Aucun token n'est reproduit dans ce document ni dans les sorties du smoke check.
