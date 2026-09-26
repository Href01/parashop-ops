/**
 * Les regles pures de l'agent SEO, sans base ni serveur : testables seules.
 */
const VIDES = new Set(['de', 'du', 'la', 'le', 'les', 'des', 'et', 'en', 'au', 'pour', 'a', 'un', 'une', 'sur', 'maroc', 'prix', 'pas', 'cher', 'acheter', 'original', 'avis'])
export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Les mots qui portent le sens d'une requete. « n°3 », « n3 », « no 3 » deviennent « 3 ». */
export function motsPorteurs(requete: string): string[] {
  const t = norm(requete).replace(/\bn\s*[°º.]?\s*(\d+)/g, ' $1 ').replace(/\bno\.?\s+(\d+)/g, ' $1 ')
  return [...new Set(t.split(/[^a-z0-9\u0600-\u06ff&]+/).filter((m) => m && !VIDES.has(m)))]
}

export const domaine = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }

