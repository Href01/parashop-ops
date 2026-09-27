/**
 * LES CONSEILS DE L'ECRAN META ADS — des regles, pas un modele : chaque conseil
 * cite ses chiffres et se recalcule a chaque ouverture, sans attendre l'agent.
 * Pur (teste seul).
 *
 * Verdict d'une pub : on compare chaque pub a la mediane de SA famille
 * (Messages avec Messages, Ventes avec Ventes). Un message coute 2 a 10 DH, un
 * achat vu par le pixel plusieurs centaines : les melanger condamnerait toutes
 * les pubs de vente et sauverait toutes les pubs de messages.
 */

export type Famille = 'messages' | 'ventes' | 'autre'
export type Verdict = 'gagnante' | 'surveiller' | 'couper' | 'trop_tot'
type Mesure = { depense: number; messages: number; achats: number; coutParResultat: number | null; ctr: number | null }
export type PubPourConseil = { adId: string; nom: string | null; statut: string | null; objectif: string | null; optimisation: string | null; boost: boolean; fatigue: boolean; frequence7j: number | null; j30: Mesure; j7: Mesure }

export function famille(p: Pick<PubPourConseil, 'objectif' | 'optimisation'>): Famille {
  const o = `${p.optimisation || ''} ${p.objectif || ''}`
  if (/CONVERSATION|MESSAG/i.test(o)) return 'messages'
  if (/OFFSITE_CONVERSIONS|VALUE|PURCHASE|SALES/i.test(o)) return 'ventes'
  return 'autre'
}

const resultats = (m: Mesure, f: Famille) => (f === 'ventes' ? m.achats + m.messages : m.messages + m.achats)
const mediane = (xs: number[]) => {
  if (!xs.length) return null
  const t = [...xs].sort((a, b) => a - b), m = Math.floor(t.length / 2)
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2
}
const dh = (x: number) => `${Math.round(x).toLocaleString('fr-FR')} DH`
const dh1 = (x: number) => `${x.toLocaleString('fr-FR', { maximumFractionDigits: x < 10 ? 1 : 0 })} DH`
const nom = (p: PubPourConseil) => `« ${(p.nom || p.adId).slice(0, 60)} »`

export function verdicts(pubs: PubPourConseil[], depenseMin: number): Record<string, { verdict: Verdict; raison: string; famille: Famille }> {
  const out: Record<string, { verdict: Verdict; raison: string; famille: Famille }> = {}
  const medianes: Record<Famille, number | null> = { messages: null, ventes: null, autre: null }
  for (const f of ['messages', 'ventes', 'autre'] as Famille[]) {
    medianes[f] = mediane(pubs.filter((p) => famille(p) === f && p.j30.depense >= depenseMin && resultats(p.j30, f) > 0).map((p) => p.j30.depense / resultats(p.j30, f)))
  }
  for (const p of pubs) {
    const f = famille(p), r = resultats(p.j30, f), med = medianes[f]
    const unite = f === 'messages' ? 'message' : 'résultat'
    if (p.j30.depense < depenseMin) { out[p.adId] = { verdict: 'trop_tot', raison: `${dh(p.j30.depense)} dépensés : on juge à partir de ${dh(depenseMin)}.`, famille: f }; continue }
    if (r === 0) {
      out[p.adId] = p.j30.depense >= 2 * depenseMin
        ? { verdict: 'couper', raison: `${dh(p.j30.depense)} dépensés sans aucun ${unite}.`, famille: f }
        : { verdict: 'surveiller', raison: `${dh(p.j30.depense)} dépensés, encore aucun ${unite}.`, famille: f }
      continue
    }
    const cout = p.j30.depense / r
    if (med == null) { out[p.adId] = { verdict: 'surveiller', raison: `${dh1(cout)} par ${unite} ; pas encore de pub comparable.`, famille: f }; continue }
    const rapport = cout / med
    if (rapport <= 0.75) out[p.adId] = { verdict: 'gagnante', raison: `${dh1(cout)} par ${unite}, ${(1 / rapport).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}× moins cher que la médiane des pubs ${f === 'messages' ? 'Messages' : f === 'ventes' ? 'Ventes' : 'du compte'} (${dh1(med)}).`, famille: f }
    else if (rapport >= 2) out[p.adId] = { verdict: 'couper', raison: `${dh1(cout)} par ${unite}, ${rapport.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}× plus cher que la médiane (${dh1(med)}).`, famille: f }
    else out[p.adId] = { verdict: 'surveiller', raison: `${dh1(cout)} par ${unite}, proche de la médiane (${dh1(med)}).`, famille: f }
  }
  return out
}

export type Niveau = 'alerte' | 'opportunite' | 'conseil'
export type Conseil = { id: string; niveau: Niveau; titre: string; detail: string; action?: { onglet?: string; adId?: string; demande?: { genre: 'analyse' | 'creatifs' | 'audit' | 'question'; sujet: string } } }

type VeritePourConseil = { jours: number; depense: number; livrees: number; ca: number; marge: number; profitApresPub: number; coutParCommandeLivree: number | null; seuilParCommande: number | null; parCanal: { canal: string; commandes: number }[] }
type ProduitPourConseil = { id: number; nom: string; marque: string; margeShine: number | null; stockVendable: number; importBloque: boolean; vendus90j: number }
type Repartition = { dimension?: string; valeur: string; depense: number; messages: number; achats: number }

export type EntreeConseils = {
  v: VeritePourConseil; precedent: VeritePourConseil | null; pubs: PubPourConseil[]
  strategie: { budgetMensuel: number | null; coutParCommandeMax: number | null; frequenceMax: number; depenseMinAvantVerdict: number; boostsAutorises: boolean; manques: string[]; produitsExclus: number[] }
  produits: ProduitPourConseil[]; enAttente: number; depenseMois: number; jourDuMois: number; joursDansMois: number
  repartitions: Record<string, Repartition[]>
}

export function conseils(e: EntreeConseils): Conseil[] {
  const out: Conseil[] = []
  const { v, precedent: p, strategie: s } = e
  const verd = verdicts(e.pubs, s.depenseMinAvantVerdict)
  const actives = e.pubs.filter((x) => x.statut === 'ACTIVE')

  // 1. Gagne-t-on de l'argent avec la pub ?
  if (v.depense > 0 && v.profitApresPub < 0) {
    out.push({ id: 'perte', niveau: 'alerte', titre: `Tu perds ${dh(-v.profitApresPub)} avec la pub sur ${v.jours} jours`,
      detail: `${dh(v.depense)} dépensés pour ${v.livrees} commande(s) livrée(s) et ${dh(v.marge)} de marge.${e.enAttente ? ` ${e.enAttente} commande(s) des 7 derniers jours sont encore en cours de livraison : ne coupe rien avant qu'elles soient livrées.` : ''}` })
  }
  if (v.coutParCommandeLivree != null && v.seuilParCommande != null && v.coutParCommandeLivree > v.seuilParCommande) {
    out.push({ id: 'seuil', niveau: 'alerte', titre: `Chaque commande coûte ${dh(v.coutParCommandeLivree)} de pub, plus que sa marge (${dh(v.seuilParCommande)})`, detail: 'Au-delà du seuil de rentabilité, chaque vente amenée par la pub fait perdre de l’argent.', action: { onglet: 'campagnes' } })
  } else if (v.coutParCommandeLivree != null && s.coutParCommandeMax != null && v.coutParCommandeLivree > s.coutParCommandeMax) {
    out.push({ id: 'cible', niveau: 'alerte', titre: `${dh(v.coutParCommandeLivree)} de pub par commande, au-dessus de ta cible (${dh(s.coutParCommandeMax)})`, detail: 'Coupe ou réduis les pubs les plus chères de l’onglet Campagnes.', action: { onglet: 'campagnes' } })
  }
  if (p && p.coutParCommandeLivree && v.coutParCommandeLivree && v.coutParCommandeLivree > p.coutParCommandeLivree * 1.3 && v.livrees >= 5) {
    out.push({ id: 'derive', niveau: 'alerte', titre: `Le coût par commande monte : ${dh(v.coutParCommandeLivree)} contre ${dh(p.coutParCommandeLivree)} la période d’avant`, detail: 'Regarde quelle pub a pris le budget (onglet Campagnes, tri par dépense 7 j).', action: { onglet: 'campagnes' } })
  }

  // 2. Les pubs : couper, relancer, renouveler.
  for (const x of actives.filter((a) => verd[a.adId]?.verdict === 'couper').slice(0, 3)) {
    out.push({ id: `couper-${x.adId}`, niveau: 'alerte', titre: `Coupe ou réduis ${nom(x)}`, detail: verd[x.adId].raison, action: { onglet: 'campagnes', adId: x.adId } })
  }
  const enPause = e.pubs.filter((a) => a.statut !== 'ACTIVE' && verd[a.adId]?.verdict === 'gagnante').sort((a, b) => (a.j30.coutParResultat ?? 1e9) - (b.j30.coutParResultat ?? 1e9))
  for (const x of enPause.slice(0, 2)) {
    out.push({ id: `relancer-${x.adId}`, niveau: 'opportunite', titre: `Relance ${nom(x)} : elle est en pause`, detail: verd[x.adId].raison, action: { onglet: 'campagnes', adId: x.adId } })
  }
  for (const x of actives.filter((a) => a.fatigue).slice(0, 2)) {
    out.push({ id: `fatigue-${x.adId}`, niveau: 'conseil', titre: `${nom(x)} fatigue : change la création`, detail: `Vue ${x.frequence7j?.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} fois par personne en 7 jours (maximum : ${s.frequenceMax}) et les clics baissent.`, action: { demande: { genre: 'creatifs', sujet: `Remplacer la pub ${nom(x)} qui fatigue : 3 nouvelles créations sur le même produit` } } })
  }
  const boosts = actives.filter((a) => a.boost && a.j7.depense > 0)
  if (!s.boostsAutorises && boosts.length) {
    out.push({ id: 'boosts', niveau: 'conseil', titre: `${boosts.length} post(s) boosté(s) optimisé(s) pour les likes`, detail: 'Ta stratégie ne les autorise pas : passe-les en campagne Messages ou Ventes, qui optimisent pour une conversation ou un achat.' })
  }

  // 3. Budget du mois.
  if (s.budgetMensuel && e.jourDuMois > 3) {
    const prevu = (s.budgetMensuel * e.jourDuMois) / e.joursDansMois
    if (e.depenseMois > prevu * 1.15) out.push({ id: 'budget-haut', niveau: 'alerte', titre: `Budget du mois dépassé au rythme actuel`, detail: `${dh(e.depenseMois)} dépensés au ${e.jourDuMois}, contre ${dh(prevu)} prévus : à ce rythme, ${dh((e.depenseMois / e.jourDuMois) * e.joursDansMois)} sur le mois pour ${dh(s.budgetMensuel)} de budget.` })
    else if (e.depenseMois < prevu * 0.7) out.push({ id: 'budget-bas', niveau: 'conseil', titre: `Le budget du mois est sous-utilisé`, detail: `${dh(e.depenseMois)} dépensés au ${e.jourDuMois}, contre ${dh(prevu)} prévus. Si les pubs gagnantes sont rentables, augmente-les.`, action: { onglet: 'campagnes' } })
  }

  // 4. Suivi : ce que Meta ne voit pas.
  const total = v.parCanal.reduce((n, c) => n + c.commandes, 0)
  const dm = v.parCanal.filter((c) => ['Instagram', 'WhatsApp'].includes(c.canal)).reduce((n, c) => n + c.commandes, 0)
  if (total >= 5 && dm / total >= 0.3) {
    out.push({ id: 'suivi', niveau: 'conseil', titre: `${Math.round((dm / total) * 100)} % des commandes livrées viennent des DM : Meta ne les voit pas`,
      detail: 'Ajoute des UTM à chaque pub (utm_source=ig&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}) et note la campagne sur les commandes prises en DM : l’agent pourra dire quelle pub vend vraiment.' })
  }

  // 5. Produit a pousser : marge x ventes, en stock, pas exclu.
  const aPousser = e.produits
    .filter((x) => x.margeShine != null && x.stockVendable >= 5 && !x.importBloque && !s.produitsExclus.includes(x.id))
    .sort((a, b) => b.margeShine! * Math.max(1, b.vendus90j) - a.margeShine! * Math.max(1, a.vendus90j))[0]
  if (aPousser) {
    out.push({ id: `pousser-${aPousser.id}`, niveau: 'opportunite', titre: `Pousse ${aPousser.marque} « ${aPousser.nom} »`,
      detail: `${dh(aPousser.margeShine!)} de marge par vente, ${aPousser.vendus90j} vendus en 90 jours, ${aPousser.stockVendable} en stock : c’est le produit qui peut le mieux porter une pub.`,
      action: { demande: { genre: 'creatifs', sujet: `3 Reels et 1 visuel pour ${aPousser.marque} « ${aPousser.nom} » (fiche ${aPousser.id}), campagne Messages` } } })
  }

  // 6. A qui la pub parle vraiment.
  const ages = (e.repartitions.age || []).filter((x) => x.messages >= 5)
  const totalAge = ages.reduce((n, x) => n + x.depense, 0)
  const meilleur = ages.filter((x) => x.depense >= totalAge * 0.1).sort((a, b) => a.depense / a.messages - b.depense / b.messages)[0]
  if (meilleur && totalAge > 0) {
    const part = Math.round((meilleur.messages / ages.reduce((n, x) => n + x.messages, 0)) * 100)
    out.push({ id: 'age', niveau: 'conseil', titre: `Les ${meilleur.valeur} ans répondent le mieux`, detail: `${part} % des messages, à ${dh1(meilleur.depense / meilleur.messages)} le message (28 derniers jours). Vise-les en priorité dans les prochaines campagnes Messages.` })
  }

  // 7. Strategie incomplete.
  if (s.manques.length) out.push({ id: 'strategie', niveau: 'conseil', titre: 'Complète ta stratégie', detail: `Il manque : ${s.manques.join(', ')}. Sans cibles, l’agent ne peut pas trancher les pubs « à surveiller ».`, action: { onglet: 'strategie' } })

  const ordre: Record<Niveau, number> = { alerte: 0, opportunite: 1, conseil: 2 }
  return out.sort((a, b) => ordre[a.niveau] - ordre[b.niveau]).slice(0, 10)
}
