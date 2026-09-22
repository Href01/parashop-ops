/**
 * Shine BOS — real-time collaboration server (Hocuspocus / Yjs).
 *
 * Runs standalone (Render, a VPS, or your own machine) — NOT on Vercel (which can't
 * hold persistent WebSocket connections). Persists each collaborative document's CRDT
 * state to the shared Postgres (`WorkspaceDoc`), so nothing is lost and the BOS can
 * render docs even when the realtime server is briefly down.
 *
 * Env:
 *   DATABASE_URL     — same Postgres as the apps.
 *   REALTIME_TOKEN   — shared secret; the BOS client must send it to connect.
 *   PORT             — provided by the host (Render sets it).
 */
const { Server } = require('@hocuspocus/server')
const { Database } = require('@hocuspocus/extension-database')
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
})

const TOKEN = process.env.REALTIME_TOKEN || ''

/**
 * PASSER PAR LE BOS PLUTOT QUE PAR SA PROPRE BASE.
 *
 * Ce serveur lisait et ecrivait "WorkspaceDoc" en direct. Le 2026-07-20 il a
 * cesse d'y arriver -- sa DATABASE_URL n'est plus valable, Neon faisant
 * tourner ses points d'acces -- et plus rien n'a ete charge ni enregistre,
 * en silence, pendant deux mois : il acceptait toujours les connexions, donc
 * rien ne paraissait casse.
 *
 * Le BOS, lui, atteint cette base sans probleme. On lui delegue donc les deux
 * operations, authentifie par le meme REALTIME_TOKEN que les clients
 * presentent deja. Une seule variable a tenir a jour au lieu de deux, et la
 * plus fragile des deux disparait.
 *
 * Postgres reste le chemin de repli si BOS_URL n'est pas defini, pour qu'une
 * installation locale continue de fonctionner sans rien configurer.
 */
const BOS = (process.env.BOS_URL || 'https://ops.shinecosmetics.ma').replace(/\/+$/, '')
const viaBos = async (chemin, options = {}) => {
  const r = await fetch(`${BOS}/api/ops/workspace/state${chemin}`, {
    ...options,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  if (!r.ok) throw new Error(`BOS ${r.status}`)
  return r.json()
}

const server = Server.configure({
  port: Number(process.env.PORT) || 3001,
  address: '0.0.0.0',

  // Only clients presenting the shared token may connect.
  async onAuthenticate({ token }) {
    if (TOKEN && token !== TOKEN) throw new Error('Not authorized')
    return {} // (could carry user context for per-room ACLs later)
  },

  extensions: [
    new Database({
      // Load the stored CRDT state for a document (null = brand new doc).
      fetch: async ({ documentName }) => {
        try {
          const { state } = await viaBos(`?name=${encodeURIComponent(documentName)}`)
          return state ? new Uint8Array(Buffer.from(state, 'base64')) : null
        } catch (e) {
          console.error('[shine-realtime] lecture par le BOS impossible, repli Postgres :', e.message)
          const r = await pool.query('SELECT data FROM "WorkspaceDoc" WHERE name = $1', [documentName])
          return r.rows[0]?.data ? new Uint8Array(r.rows[0].data) : null
        }
      },
      // Persist the latest CRDT state (Hocuspocus debounces the calls).
      store: async ({ documentName, state }) => {
        try {
          // Le BOS FUSIONNE l'etat recu avec le stocke : aucune ecriture ne
          // peut effacer ce qu'un autre editeur aurait ajoute entre-temps.
          await viaBos('', { method: 'POST', body: JSON.stringify({ name: documentName, update: Buffer.from(state).toString('base64') }) })
        } catch (e) {
          console.error('[shine-realtime] ecriture par le BOS impossible, repli Postgres :', e.message)
          await pool.query(
            `INSERT INTO "WorkspaceDoc" (name, data, "updatedAt") VALUES ($1, $2, now())
             ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, "updatedAt" = now()`,
            [documentName, Buffer.from(state)]
          )
        }
      },
    }),
  ],
})

/**
 * BATTEMENT DE COEUR — dit si CE serveur atteint la base.
 *
 * Quand l'espace collaboratif reste sur « Chargement… » alors que la connexion
 * est etablie, la cause est presque toujours ici : le serveur accepte le
 * WebSocket (le jeton est bon) mais n'arrive pas a lire "WorkspaceDoc", donc
 * Hocuspocus n'emet jamais « synced » et le client affiche un document vide.
 *
 * Rien ne permettait de le voir de l'exterieur : la sonde de sante de Render
 * ne repond que « OK », et lui ajouter un hook `onRequest` a deja casse le
 * WebSocket une fois -- on ne rejoue pas cela. Ce battement contourne le
 * probleme : s'il apparait dans la table, la base repond ; s'il n'apparait
 * pas, son absence est la reponse.
 *
 * Il ne peut jamais faire tomber le serveur : tout est avale, et un echec se
 * contente d'une ligne de journal.
 */
const DEMARRE_A = new Date()
async function battement() {
  try {
    await viaBos('', { method: 'POST', body: JSON.stringify({ heartbeat: true, startedAt: DEMARRE_A, version: process.version }) })
  } catch (e) {
    console.error('[shine-realtime] base INJOIGNABLE pour le battement :', e.message)
  }
}

server.listen().then(() => {
  console.log(`[shine-realtime] listening on :${Number(process.env.PORT) || 3001}`)
  battement()
  setInterval(battement, 120_000).unref?.()
})
