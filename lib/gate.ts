/**
 * Custom "gate" — a single shared password in front of the whole BOS, shown as
 * a branded page (not the browser's native Basic Auth popup).
 *
 * The cookie stores a hash of the password (not the password itself), so it
 * can't be forged without knowing it. Edge-safe (uses the global Web Crypto).
 *
 * Password source: GATE_PASSWORD, falling back to the older BASIC_AUTH_PASSWORD
 * so the value already set in Vercel keeps working.
 */

export const GATE_COOKIE = 'bos_gate'

function gatePassword(): string {
  return process.env.GATE_PASSWORD || process.env.BASIC_AUTH_PASSWORD || ''
}

export function gateEnabled(): boolean {
  return gatePassword().length > 0
}

async function sha256hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Deterministic cookie value for the current gate password (null if disabled). */
export async function gateToken(): Promise<string | null> {
  const pw = gatePassword()
  if (!pw) return null
  return sha256hex(`${pw}::${process.env.NEXTAUTH_SECRET || 'shine-gate'}`)
}

export function verifyGatePassword(input: string): boolean {
  const pw = gatePassword()
  return pw.length > 0 && input === pw
}
