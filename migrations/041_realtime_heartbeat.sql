-- Migration 041 : savoir si le serveur temps-reel atteint la base
--
-- Le serveur de collaboration tourne sur Render, avec ses propres variables
-- d'environnement. Quand l'espace collaboratif reste sur « Chargement… » alors
-- que la connexion est etablie, la cause probable est qu'il accepte la
-- connexion mais n'arrive pas a lire "WorkspaceDoc" -- sa `DATABASE_URL` peut
-- avoir expire, Neon faisant tourner ses points d'acces.
--
-- Impossible a verifier depuis l'exterieur : le serveur ne repond que « OK » a
-- sa sonde de sante, et ajouter un hook `onRequest` a deja casse le WebSocket
-- une fois. Cette table renverse le probleme : le serveur y ecrit un battement
-- au demarrage puis regulierement. S'il y arrive, sa base fonctionne ; s'il
-- n'y arrive pas, l'absence de ligne est elle-meme la reponse.
CREATE TABLE IF NOT EXISTS "RealtimeHeartbeat" (
  id          integer PRIMARY KEY DEFAULT 1,
  "beatAt"    timestamptz NOT NULL DEFAULT NOW(),
  "startedAt" timestamptz,
  version     text,
  CONSTRAINT "RealtimeHeartbeat_une_seule_ligne" CHECK (id = 1)
);
