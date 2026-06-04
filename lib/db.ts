import { Pool } from 'pg'

// Shared database connection with main website
// Same Neon PostgreSQL instance
const isVercel = Boolean(process.env.VERCEL)
const isProd = process.env.NODE_ENV === 'production'
const url = process.env.DATABASE_URL
const isPooler = Boolean(url && /pooler\./i.test(url))

const poolMax = isPooler
  ? 10
  : (isVercel || isProd)
    ? 1
    : 10

const pool = new Pool({
  connectionString: url,
  max: poolMax,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
})

export default pool
