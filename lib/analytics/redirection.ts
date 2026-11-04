import { redirect } from 'next/navigation'

/**
 * LES ANCIENNES ADRESSES D'ANALYTICS RENVOIENT VERS LA VUE QUI LES A ABSORBÉES.
 *
 * Onze modules sont devenus sept onglets : /analytics/conversion est maintenant la vue « conversion » de
 * /analytics/parcours. Un favori, un lien partagé ou un lien dans un message garde sa vue ET ses réglages
 * (période, segments) — il n'atterrit jamais sur une page vide.
 */
type Brut = Record<string, string | string[] | undefined>

export function urlVue(base: string, vue: string | null, brut: Brut): string {
  const p = new URLSearchParams()
  for (const [cle, valeur] of Object.entries(brut)) {
    for (const v of Array.isArray(valeur) ? valeur : valeur != null ? [valeur] : []) p.append(cle, v)
  }
  if (vue) p.set('vue', vue)
  const q = p.toString()
  return q ? `${base}?${q}` : base
}

/** À appeler depuis la page de l'ancienne adresse. */
export async function redirigerVue(base: string, vue: string | null, searchParams: Promise<Brut>): Promise<never> {
  redirect(urlVue(base, vue, await searchParams))
}
