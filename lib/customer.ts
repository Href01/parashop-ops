import bcrypt from 'bcryptjs'

interface Db { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> }

/** Normalize a Moroccan phone to its 9-digit core. */
export function phoneKey(p: string | null | undefined): string {
  let d = (p || '').replace(/\D/g, '')
  if (d.startsWith('212')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return d.slice(-9)
}

/**
 * Find an existing customer by phone, or create a guest one (placeholder email,
 * random password, role USER). Returns the User id, or null if no usable phone.
 * Avoids "ghost" customers (orders with userId null that never show in /customers).
 */
export async function findOrCreateCustomer(db: Db, name: string | null, phone: string | null): Promise<number | null> {
  const k = phoneKey(phone)
  if (!k) return null
  const found = await db.query(
    `SELECT id FROM "User" WHERE phone IS NOT NULL AND right(regexp_replace(phone, '\\D', '', 'g'), 9) = $1 LIMIT 1`,
    [k]
  )
  if (found.rows[0]) return found.rows[0].id
  const hash = await bcrypt.hash('guest-' + Math.random().toString(36).slice(2), 10)
  const ins = await db.query(
    `INSERT INTO "User" (email, name, password, phone, role, "createdAt")
     VALUES ($1, $2, $3, $4, 'USER', NOW())
     ON CONFLICT (email) DO UPDATE SET phone = EXCLUDED.phone
     RETURNING id`,
    [`guest-${k}@shine.local`, name || 'Cliente', hash, phone]
  )
  return ins.rows[0].id
}
