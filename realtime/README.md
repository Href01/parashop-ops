# Shine Realtime — serveur de collaboration temps-réel (Hocuspocus / Yjs)

Serveur WebSocket qui fait tourner l'espace collaboratif du BOS (édition temps-réel,
présence, curseurs). **Ne peut PAS tourner sur Vercel** (pas de connexions longues).
Il persiste chaque document dans le **Postgres partagé** (table `WorkspaceDoc`).

Vérifié : démarre, `GET /` → 200 (health), accepte les connexions WS, l'état Yjs
fait un aller-retour complet dans Postgres (BYTEA).

## Variables d'environnement
| Var | Rôle |
|---|---|
| `DATABASE_URL` | Le même Postgres que les apps (avec `?sslmode=require`) |
| `REALTIME_TOKEN` | Secret partagé ; le BOS doit l'envoyer pour se connecter. Génère-en un long/aléatoire |
| `PORT` | Fourni par l'hébergeur (Render l'injecte tout seul) |

## Déploiement sur Render (gratuit, sans carte)
1. Va sur **render.com** → inscris-toi (GitHub/e-mail, **pas de carte**).
2. **New → Web Service** → connecte le repo `Href01/parashop-ops`.
3. Réglages :
   - **Root Directory** : `realtime`
   - **Runtime** : Node
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : **Free**
4. **Environment** → ajoute `DATABASE_URL` (ta chaîne Postgres) et `REALTIME_TOKEN`
   (un secret aléatoire long). *(Ne touche pas à `PORT`, Render le gère.)*
5. Deploy. Note l'URL, ex : `https://shine-realtime.onrender.com`.
   → l'URL WebSocket du BOS sera `wss://shine-realtime.onrender.com`.

## Empêcher la mise en veille (le "pinger" gratuit)
Le tier gratuit Render s'endort après 15 min d'inactivité. Garde-le éveillé :
1. Va sur **cron-job.org** (gratuit, sans carte) → crée un compte.
2. **Create cronjob** : URL = `https://TON-SERVICE.onrender.com/`, intervalle = **toutes les 10 min**.
3. C'est tout — le ping HTTP renvoie `OK` (200) et empêche la veille. Reste dans les
   750 h/mois gratuites de Render.

## Côté BOS (à configurer après le déploiement)
Dans Vercel (projet ops), ajoute :
- `NEXT_PUBLIC_REALTIME_URL` = `wss://TON-SERVICE.onrender.com`
- `REALTIME_TOKEN` = **le même** secret que ci-dessus (servi au client via une route gardée).

## Tester en local
```bash
cd realtime && npm install
DATABASE_URL="...", REALTIME_TOKEN=dev npm start      # démarre sur :3001
node smoketest.js                                      # (installe d'abord yjs + @hocuspocus/provider)
```
