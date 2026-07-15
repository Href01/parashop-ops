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

server.listen().then(() => {
  console.log(`[shine-realtime] listening on :${Number(process.env.PORT) || 3001}`)
})
