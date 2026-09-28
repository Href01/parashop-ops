import { dureeVoix, fautesFrancais } from '@/lib/ads/direction-model'
import type { Creatif, Option } from '../agent/ui/types'

export const LANGUES_VOIX = ['fr', 'darija', 'ar'] as const
/** La duree de la voix d'un plan : mesuree si le son genere lit bien ce texte, estimee sinon (0 sans voix). */
export function dureeVoixPlan(o: Option, l: (typeof LANGUES_VOIX)[number], mesure?: number): number {
  const texte = (o.motion?.voix?.[l] || '').trim()
  if (!texte) return 0
  const faite = o.motion?.voixUrl?.[l]
  const reelle = faite && faite.texte === texte ? (faite.duree ?? mesure) : undefined
  return reelle ?? dureeVoix(texte)
}

/**
 * AVANT DE PUBLIER : ce qui fait qu'une pub part propre. Pur (teste seul).
 * Chaque point dit ce qu'il verifie et, s'il echoue, quoi faire.
 */
export type Point = { id: string; ok: boolean; titre: string; detail: string; bloquant: boolean }

const francais = (c: Creatif, opts: Option[]) => [
  c.accroche, c.texte_fr, c.titre, c.cta,
  ...opts.flatMap((o) => [o.texte?.fr, ...(o.motion?.bulles ?? []).map((b) => b.texte?.fr), ...(o.motion?.points ?? []).map((x) => x.fr), ...(o.motion?.choix ?? []).map((x) => x.fr), o.motion?.voix?.fr]),
]

export function verifierPublication(c: Creatif, opts: Option[], type: 'reel' | 'carrousel' | 'options' | 'image', langues: string[], packs: Record<number, number[]> = {}): Point[] {
  const out: Point[] = []
  const fautes = [...new Set(francais(c, opts).flatMap(fautesFrancais))]
  out.push({ id: 'accents', ok: !fautes.length, bloquant: true, titre: 'Le français a tous ses accents', detail: fautes.length ? `À corriger : ${fautes.map((f) => `« ${f} »`).join(', ')}` : 'Textes à l’écran, bulles, voix et légende.' })
  // Un plan sur fond Shine dessine n'a pas de decor a peindre.
  const aPeindre = opts.filter((o) => (!o.motion?.fond || o.motion.fond === 'decor') && !o.motion?.clip)
  const peints = aPeindre.filter((o) => c.images.some((i) => i.option_id === o.id)).length
  if (type === 'image') {
    out.push({ id: 'visuel', ok: c.images.some((i) => i.carte == null), bloquant: true, titre: 'Un visuel est prêt', detail: 'Génère un visuel ou lance une direction.' })
  } else {
    const attendent = opts.map((o, i) => (String(o.motion?.clipPrompt ?? '').trim() && !o.motion?.clip ? i + 1 : 0)).filter(Boolean)
    if (attendent.length) out.push({ id: 'clips', ok: false, bloquant: false, titre: 'Des clips réels manquent', detail: `Plan(s) ${attendent.join(', ')} : la consigne est écrite, le clip pas encore là (le fond prévu le remplace en attendant).` })
    const sons = opts.map((o, i) => (o.motion?.clipSon && o.motion?.clip ? i + 1 : 0)).filter(Boolean)
    if (sons.length) out.push({ id: 'sons', ok: false, bloquant: false, titre: 'Écoute le son des clips', detail: `Plan(s) ${sons.join(', ')} : le son vient de la vidéo (Higgsfield). Le directeur artistique voit les images mais ne peut pas écouter : vérifie qu’il est juste (voix, darija, bruits).` })
    out.push({ id: 'peints', ok: peints === aPeindre.length && opts.length > 0, bloquant: true, titre: type === 'reel' ? 'Tous les décors sont peints' : 'Toutes les cartes ont leur visuel', detail: aPeindre.length < opts.length ? `${peints}/${aPeindre.length} décors peints · ${opts.length - aPeindre.length} plan(s) sur fond Shine dessiné.` : `${peints}/${opts.length} prêts.` })
  }
  if (type === 'reel') {
    const durees = opts.map((o) => Number(o.duree) || 0)
    const total = durees.reduce((n, d) => n + d, 0)
    const p1 = opts[0], fin = opts.find((o) => o.mouvement === 'fin')
    out.push({ id: 'accroche', ok: (durees[0] ?? 9) <= 2.5, bloquant: true, titre: 'L’accroche tient en 2,5 s', detail: `Plan 1 : ${durees[0] ?? '—'} s. Au-delà, on a déjà scrollé.` })
    out.push({ id: 'produit1', ok: Boolean(p1?.animes?.length || p1?.produit_ids?.length), bloquant: false, titre: 'Un produit dès le plan 1', detail: 'Le produit héros se voit dans la première seconde.' })
    out.push({ id: 'duree', ok: total >= 8 && total <= 15, bloquant: false, titre: 'Entre 8 et 15 secondes', detail: `${total} s au total. Plus court, on ne comprend pas ; plus long, on décroche.` })
    // Un pack est montre si l'un de ses produits l'est (on anime les produits, pas la photo du pack).
    const manquants = c.produit_ids.filter((id) => !fin?.animes?.includes(id) && !(packs[id] ?? []).some((x) => fin?.animes?.includes(x)))
    out.push({ id: 'fin', ok: Boolean(fin) && (c.produit_ids.length > 4 || !manquants.length), bloquant: false, titre: 'La carte de fin montre toute la routine', detail: fin ? (manquants.length && c.produit_ids.length <= 4 ? `Manque : #${manquants.join(', #')}.` : 'Tous les produits et le bouton.') : 'Ajoute un plan « fin » (produits + bouton).' })
    out.push({ id: 'confiance', ok: Boolean(fin?.motion?.confiance?.includes('cod')), bloquant: false, titre: '« Paiement à la livraison » sur la fin', detail: 'Au Maroc, c’est ce qui lève le dernier frein. Ouvre le plan de fin → « Rassurer la cliente ».' })
    const voix = opts.filter((o) => o.motion?.voix?.fr).length
    const debordent = opts.flatMap((o, i) => {
      const langues = LANGUES_VOIX.filter((l) => dureeVoixPlan(o, l) > (Number(o.duree) || 0) + 0.3)
      return langues.length ? [`plan ${i + 1} (${langues.join(', ')})`] : []
    })
    out.push({
      id: 'voix', ok: !debordent.length, bloquant: false,
      titre: !voix ? 'Pas de voix off (facultatif)' : debordent.length ? 'Une voix déborde de son plan' : `Voix off calée sur ${voix} plan(s)`,
      detail: debordent.length ? `${debordent.join(', ')} : la voix dure plus que le plan, la suivante est décalée et la dernière coupée. Onglet Son : allonger le plan ou raccourcir le texte.` : 'Les bruitages sont faits pour chaque mouvement ; ajoute un son tendance dans Instagram.',
    })
  }
  const aDarija = langues.includes('darija')
  out.push({ id: 'legende', ok: Boolean(c.texte_fr) && (!aDarija || Boolean(c.texte_darija)), bloquant: false, titre: aDarija ? 'Légende en français et en darija' : 'Légende en français', detail: 'Le texte de la pub, avec l’appel à l’action du canal.' })
  return out
}

/** Des hashtags pour la legende : la marque, le besoin, le Maroc, le service. */
export function hashtags(marques: string[], categories: string[]): string[] {
  const tag = (s: string) => `#${s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '').toLowerCase()}`
  const besoin = categories.flatMap((c) => (c === 'Cheveux' ? ['#soinscheveux', '#cheveux'] : c === 'Visage' ? ['#skincare', '#kbeauty', '#soinvisage'] : c === 'Corps' ? ['#soincorps'] : []))
  return [...new Set([...marques.map(tag), ...besoin, '#maroc', '#casablanca', '#rabat', '#beautemaroc', '#paiementalalivraison', '#livraisonmaroc'])].filter((x) => x.length > 2)
}
