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
        const r = await pool.query('SELECT data FROM "WorkspaceDoc" WHERE name = $1', [documentName])
        return r.rows[0]?.data ? new Uint8Array(r.rows[0].data) : null
      },
      // Persist the latest CRDT state (Hocuspocus debounces the calls).
      store: async ({ documentName, state }) => {
        await pool.query(
          `INSERT INTO "WorkspaceDoc" (name, data, "updatedAt") VALUES ($1, $2, now())
           ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, "updatedAt" = now()`,
          [documentName, Buffer.from(state)]
        )
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
    await pool.query(
      `INSERT INTO "RealtimeHeartbeat" (id, "beatAt", "startedAt", version)
       VALUES (1, NOW(), $1, $2)
       ON CONFLICT (id) DO UPDATE SET "beatAt" = NOW(), "startedAt" = EXCLUDED."startedAt", version = EXCLUDED.version`,
      [DEMARRE_A, process.version]
    )
  } catch (e) {
    console.error('[shine-realtime] base INJOIGNABLE pour le battement :', e.message)
  }
}

server.listen().then(() => {
  console.log(`[shine-realtime] listening on :${Number(process.env.PORT) || 3001}`)
  battement()
  setInterval(battement, 120_000).unref?.()
})
