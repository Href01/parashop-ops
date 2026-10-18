# Identité git obligatoire — auteur & committer

**Statut :** règle active ; hook versionné, **non activé**
**Date :** 2026-10-18
**Portée :** `parashop` et `parashop-ops`
**Owner :** Platform & DevOps

## La règle

Tout commit poussé vers GitHub doit avoir :

| Champ | Valeur obligatoire |
| --- | --- |
| Auteur (email) | `mekouar01@gmail.com` |
| Committer (email) | `mekouar01@gmail.com` |
| Nom | nom d'agent conservé (ex. `Platform & DevOps`, `Release Manager`) |
| Message | trailer `Agent: <nom>` |

Un seul email est autorisé : celui du compte Vercel qui déploie les deux projets.
Le nom d'agent reste libre — il ne faut **pas** usurper l'identité d'Achraf, seulement
utiliser son email autorisé.

## Cause racine (vérifiée le 18/10/2026)

Vercel refuse de construire une PR dont le commit de tête n'est pas signé par le
compte autorisé. Le 18/10, 4 PRs sur 6 ont été bloquées de cette façon :

- PR #5 (`048469f`, branche `feat/attribution-multitouch-order`) :
  `Site Engineer (Paperclip) <agents@shinecosmetics.ma>`
- PR #4 (`85c33eb`) : même cause.
- PRs #2 et #3 : premiers commits par
  `achraf.mekouar@glovoapp.com`.

Pourquoi cela arrive :

- les clones persistants (`shine-workspaces/agents/*`, `parashop`, `parashop-ops`)
  ont bien `user.email=mekouar01@gmail.com` ;
- mais un clone temporaire sans configuration locale retombe sur
  `achraf.mekouar@glovoapp.com` (email global de la machine) ;
- pour éviter d'usurper Achraf, un run a forcé
  `-c user.email=agents@shinecosmetics.ma` — rien ne bloquait ce push.

La règle existait seulement dans les instructions des agents : aucun garde-fou
technique dans les dépôts.

## Vérification

```sh
# HEAD : auteur ET committer
node scripts/check-git-identity.mjs
npm run verify:git-identity

# Toute la branche (défaut : origin/main..HEAD)
node scripts/check-git-identity.mjs --range
node scripts/check-git-identity.mjs --range=main..HEAD

# Tests du script (dépôts git temporaires)
node --test tests/git-identity.test.mjs
npm run test:git-identity
```

Codes retour :

- `0` : conforme ;
- `1` : email fautif (le message liste commit, rôle, nom et email, puis la
  commande de correction) ;
- `2` : erreur d'environnement ou d'usage (pas un dépôt git, plage introuvable).

Le script est en lecture seule : il ne modifie ni l'historique ni le remote.

### Portée du contrôle

- Le contrôle par défaut (HEAD) correspond à ce que Vercel examine pour autoriser
  un build.
- `--range` audite tous les commits de la branche. Il peut signaler d'anciens
  commits fautifs déjà poussés : **ne pas les réécrire**. Le commit vide autorisé
  en tête débloque Vercel (voir ci-dessous).

## Hook pre-push

`.githooks/pre-push` appelle le script sur HEAD et bloque le push si le code
retour n'est pas `0`.

Le hook est **versionné mais non activé** : aucun `core.hooksPath` n'est modifié
par ce dépôt. Chaque clone doit l'activer explicitement.

### Activation (accord Achraf requis, donné via la PR)

```sh
git config --local core.hooksPath .githooks
```

Vérifier :

```sh
git config --local --get core.hooksPath   # -> .githooks
```

Le hook nécessite que `node` soit dans le `PATH` utilisé par Git. Le fichier
`.gitattributes` force `eol=lf` sur `.githooks/*` pour éviter un shebang CRLF
sous Windows.

### Rollback

```sh
git config --local --unset core.hooksPath
```

### Contournement volontaire

Un push peut toujours être forcé avec `git push --no-verify`. Le hook est un
garde-fou, pas une garantie : la vérification manuelle
(`npm run verify:git-identity`) reste la référence.

## Réparation sans réécriture d'historique

La procédure qui a fonctionné sur les PRs #2 et #3 est conservée : un commit vide
en tête de branche, avec l'identité autorisée, sans réécriture ni force-push.

### Commit de tête local, jamais poussé

```sh
git config --local user.email mekouar01@gmail.com
git config --local user.name "<nom d'agent>"
git commit --amend --no-edit --reset-author
```

### Branche déjà poussée / PR ouverte

```sh
git config --local user.email mekouar01@gmail.com
git config --local user.name "<nom d'agent>"
git commit --allow-empty -m "chore: relance build Vercel avec identite autorisee"
git push
```

Preuves du 18/10 : commits vides `3933238` et `8441d03` par
`Release Manager <mekouar01@gmail.com>` → Vercel SUCCESS sur les PRs #2 et #3.

Règles absolues :

- jamais de `git push --force` / `--force-with-lease` sur une PR ouverte ;
- jamais de `rebase`, `filter-branch` ou `commit --amend` sur un commit déjà
  poussé ;
- le commit vide doit contenir le trailer `Agent: <nom>`.

## Vérification après réparation

```sh
node scripts/check-git-identity.mjs          # HEAD -> 0
git log -1 --format='%h %an <%ae> | %cn <%ce>'  # auteur et committer autorisés
```

Puis vérifier le statut Vercel de la PR. Si le build reste bloqué, escalader à
Achraf : ne pas tenter de réécrire la branche.

## Ce que le script ne couvre pas

- Les commits présents uniquement sur le remote et pas encore récupérés
  (`git fetch` avant `--range`).
- Les signatures GPG ; seul l'email est contrôlé.
- L'activation du hook : elle est volontairement manuelle (accord Achraf).
- Les pushes faits avec `--no-verify`.

## Fichiers concernés

- `scripts/check-git-identity.mjs`
- `tests/git-identity.test.mjs`
- `.githooks/pre-push`
- `.gitattributes`
- `package.json` (`verify:git-identity`, `test:git-identity`)
- `AGENTS.md` (section « Identité git obligatoire »)
