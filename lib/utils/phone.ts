/**
 * Phone number utilities for Morocco
 * Prevents Sendit API phone format errors
 */

/**
 * Normalize Morocco phone to standard format
 * Input: "06 12 34 56 78" or "0612345678" or "+212612345678"
 * Output: "0612345678"
 */
export function normalizeMoroccoPhone(phone: string): string {
  // Remove all spaces, dashes, dots
  let cleaned = phone.replace(/[\s\-\.]/g, '')

  // Remove +212 prefix if present
  if (cleaned.startsWith('+212')) {
    cleaned = '0' + cleaned.slice(4)
  } else if (cleaned.startsWith('212')) {
    cleaned = '0' + cleaned.slice(3)
  }

  // Validate format
  if (!/^(06|07)\d{8}$/.test(cleaned)) {
    throw new Error(`Invalid Morocco phone: ${phone}. Must be 06XXXXXXXX or 07XXXXXXXX`)
  }

  return cleaned
}

/**
 * Format for Sendit API
 * Sendit accepts: 06XXXXXXXX (Morocco local format)
 */
export function formatPhoneForSendit(phone: string): string {
  return normalizeMoroccoPhone(phone)
}

/**
 * Format for display
 * Output: "06 12 34 56 78"
 */
export function formatPhoneForDisplay(phone: string): string {
  const normalized = normalizeMoroccoPhone(phone)
  return normalized.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5')
}

/**
 * Validate phone number
 */
export function isValidMoroccoPhone(phone: string): boolean {
  try {
    normalizeMoroccoPhone(phone)
    return true
  } catch {
    return false
  }
}
