/**
 * COMMENT LE TABLEAU DE BORD MONTRE LE DÉPÔT-VENTE — sans changer un dirham du résultat.
 *
 * Le calcul comptable était juste mais l'affichage trompait. La ligne « Pub » contenait
 * TOUTE la dépense Meta (3 594 MAD sur 30 jours), partenaire compris (1 723 MAD), puis une
 * ligne « sa pub moins sa part » rendait 1 019 MAD (= 704 sa part − 1 723 sa pub). Résultat
 * identique, mais on lisait « ma pub » là où une partie n'était pas la tienne, et une ligne
 * négative difficile à interpréter.
 *
 * Achraf, 2026-10-29 : « je ne compte plus la pub du partenaire comme un coût pour moi ».
 * L'affichage devient celui-là :
 *
 *   Pub                      = la dépense de Shine seule      (3 594 − 1 723 = 1 871)
 *   Part du partenaire       = sa part de la marge avant pub  (+ frais du partenariat)  (704)
 *
 * Et la marge nette est la MÊME, à l'identique. C'est l'invariant que le test épingle :
 *
 *   brut − pub − emballage − retours − (part + frais − pubPartenaire)
 *     = brut − pubShine − emballage − retours − partPartenaire
 *
 * puisque pubShine = pub − pubPartenaire et partPartenaire = part + frais.
 * La trésorerie n'est PAS touchée : c'est de l'argent réel, Shine règle bien Meta, et
 * l'avance du partenaire entre bien en caisse.
 */

const r2 = (n: number) => Math.round(n * 100) / 100

export type EntreeDepot = {
  /** Toute la dépense publicitaire de la période, partenaire compris. */
  pub: number
  /** Sa part de la marge (avant pub, pour une « pub à sa charge »). */
  partnerShare: number
  /** Frais du partenariat. */
  frais: number
  /** La part de la dépense qui sert SES produits. */
  pubPartenaire: number
}

export function affichageDepotVente(e: EntreeDepot) {
  return {
    /** La dépense publicitaire de Shine seule. */
    pubShine: r2(e.pub - e.pubPartenaire),
    /** Ce que Shine lui reverse sur ses ventes : sa part + les frais du partenariat. */
    partPartenaire: r2(e.partnerShare + e.frais),
    /** Rappel pour le sous-titre : la pub de ses produits, qui n'est pas la dépense de Shine. */
    pubPartenaire: r2(e.pubPartenaire),
  }
}
