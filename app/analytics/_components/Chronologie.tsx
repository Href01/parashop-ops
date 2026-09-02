'use client'

/**
 * LA CHRONOLOGIE D'UNE SESSION — ce qu'elle a fait, dans quel ordre, et avec
 * quels chiffres.
 *
 * LA COULEUR PORTE LA FAMILLE D'ACTION, pas l'humeur. Sept familles, sept
 * couleurs : arriver, découvrir, s'intéresser, mettre au panier, payer,
 * commander, buter. C'est ce qui permet de LIRE une session sans la lire — une
 * colonne qui vire du bleu au vert puis au rouge raconte déjà l'histoire, et on
 * repère un parcours qui n'atteint jamais le vert d'un coup d'œil.
 *
 * Une couleur au hasard par ligne n'aiderait pas ; une couleur par famille,
 * toujours la même, s'apprend en trois sessions et se lit ensuite sans effort.
 *
 * LE DÉTAIL VIENT DES `props`, PAS DU NOM DE L'ÉVÈNEMENT. Chaque évènement
 * transporte ce qu'il faut pour raconter précisément : le produit et son prix,
 * le total du panier, le mot cherché et le nombre de résultats, la ville et les
 * frais, le motif exact d'un refus. Ne pas l'afficher revenait à jeter
 * l'information la plus utile qu'on collecte.
 */

import { V } from './Viz'

export type Evenement = { name: string; path: string | null; props: Record<string, unknown>; at: string }

type Famille = 'arrivee' | 'decouverte' | 'interet' | 'panier' | 'paiement' | 'commande' | 'friction' | 'bruit'

/** Une couleur par famille. Elles ne se ressemblent pas deux à deux. */
export const FAMILLES: Record<Famille, { couleur: string; fond: string; label: string }> = {
  arrivee:    { couleur: '#475569', fond: '#F1F5F9', label: 'Arrivée' },
  decouverte: { couleur: '#1D4ED8', fond: '#EFF6FF', label: 'Découverte' },
  interet:    { couleur: '#7C3AED', fond: '#F5F3FF', label: 'Intérêt' },
  panier:     { couleur: '#0D9488', fond: '#F0FDFA', label: 'Panier' },
  paiement:   { couleur: '#B45309', fond: '#FFFBEB', label: 'Paiement' },
  commande:   { couleur: '#15803D', fond: '#F0FDF4', label: 'Commande' },
  friction:   { couleur: '#B91C1C', fond: '#FEF2F2', label: 'Friction' },
  bruit:      { couleur: '#94A3B8', fond: '#F8FAFC', label: 'Bruit ambiant' },
}

/** Ce que chaque évènement veut dire, en français, avec sa famille. */
export const SENS: Record<string, { label: string; famille: Famille }> = {
  /* Arriver */
  SESSION_START:        { label: 'Arrive sur le site', famille: 'arrivee' },
  SESSION_RETURNING:    { label: 'Première visite ou retour', famille: 'arrivee' },
  PAGE_VIEW:            { label: 'Ouvre une page', famille: 'arrivee' },
  CLICK_UI:             { label: 'Clique', famille: 'arrivee' },
  CLICK_WHATSAPP:       { label: 'Ouvre WhatsApp', famille: 'arrivee' },

  /* Découvrir */
  PRODUCT_IMPRESSION:   { label: 'Voit un produit en rayon', famille: 'decouverte' },
  PRODUCT_CLICK:        { label: 'Clique un produit', famille: 'decouverte' },
  BRAND_VIEW:           { label: 'Parcourt une marque', famille: 'decouverte' },
  CLICK_BRAND:          { label: 'Clique une marque', famille: 'decouverte' },
  SEARCH_QUERY:         { label: 'Tape dans la recherche', famille: 'decouverte' },
  SEARCH_SUBMIT:        { label: 'Lance la recherche', famille: 'decouverte' },
  SEARCH_RESULT_CLICK:  { label: 'Clique un résultat', famille: 'decouverte' },
  SEARCH_FILTER_APPLIED:{ label: 'Filtre les résultats', famille: 'decouverte' },
  RECOMMENDATIONS_SHOWN:{ label: 'Voit des suggestions', famille: 'decouverte' },
  RECOMMENDATION_CLICKED:{ label: 'Clique une suggestion', famille: 'decouverte' },

  /* S'intéresser */
  PRODUCT_VIEW_DETAIL:  { label: 'Ouvre une fiche produit', famille: 'interet' },
  PRODUCT_GALLERY_BROWSED:{ label: 'Regarde les photos', famille: 'interet' },
  PRODUCT_REVIEWS_OPENED:{ label: 'Lit les avis', famille: 'interet' },
  PRODUCT_CONTENT_SECTION_CLICK:{ label: 'Déplie une section', famille: 'interet' },
  PRODUCT_ADD_TO_WISHLIST:{ label: 'Met en favori', famille: 'interet' },
  STICKY_CTA_SHOWN:     { label: 'Voit la barre d’achat', famille: 'interet' },
  VIEW_LOYALTY_CARD:    { label: 'Regarde sa carte de fidélité', famille: 'interet' },

  /* Mettre au panier */
  PRODUCT_ADD_TO_CART:  { label: 'Ajoute au panier', famille: 'panier' },
  STICKY_CTA_CLICKED:   { label: 'Ajoute depuis la barre collante', famille: 'panier' },
  PRODUCT_QTY_CHANGED:  { label: 'Change la quantité', famille: 'panier' },
  VIEW_CART:            { label: 'Ouvre le panier', famille: 'panier' },
  PRODUCT_REMOVE_FROM_CART:{ label: 'Retire du panier', famille: 'friction' },
  CART_CLEAR:           { label: 'Vide le panier', famille: 'friction' },

  /* Payer */
  CLICK_CHECKOUT_FROM_CART:{ label: 'Passe au paiement', famille: 'paiement' },
  BEGIN_CHECKOUT:       { label: 'Démarre le paiement', famille: 'paiement' },
  CHECKOUT_STEP:        { label: 'Avance dans le paiement', famille: 'paiement' },
  DELIVERY_CITY_SELECTED:{ label: 'Choisit sa ville', famille: 'paiement' },
  DELIVERY_FEE_SHOWN:   { label: 'Voit les frais de livraison', famille: 'paiement' },
  ADD_PAYMENT_INFO:     { label: 'Saisit ses coordonnées', famille: 'paiement' },
  PROMO_CODE_APPLIED:   { label: 'Applique un code promo', famille: 'paiement' },
  USE_POINTS:           { label: 'Utilise ses points', famille: 'paiement' },
  OTP_REQUESTED:        { label: 'Demande le code', famille: 'paiement' },
  OTP_SENT:             { label: 'Code envoyé', famille: 'paiement' },
  OTP_SUBMITTED:        { label: 'Saisit le code', famille: 'paiement' },
  OTP_RESENT:           { label: 'Code renvoyé', famille: 'paiement' },
  OTP_VERIFIED:         { label: 'Numéro vérifié', famille: 'commande' },
  PLACE_ORDER:          { label: 'Envoie la commande', famille: 'paiement' },

  /* Commander */
  PURCHASE_SUCCESS:     { label: 'COMMANDE ACCEPTÉE', famille: 'commande' },
  ORDER_CREATED:        { label: 'Commande enregistrée', famille: 'commande' },
  ORDER_CONFIRMED:      { label: 'Commande confirmée', famille: 'commande' },
  ORDER_DELIVERED:      { label: 'Commande livrée', famille: 'commande' },
  RESTOCK_NOTIFY_SUBMITTED:{ label: 'Demande à être prévenue du retour', famille: 'commande' },

  /* Buter */
  PURCHASE_FAILED:      { label: 'COMMANDE REFUSÉE par le site', famille: 'friction' },
  ORDER_CANCELLED:      { label: 'Commande annulée', famille: 'friction' },
  CHECKOUT_ABANDONED:   { label: 'Quitte le paiement', famille: 'friction' },
  CHECKOUT_FIELD_ABANDON:{ label: 'Bloque sur un champ', famille: 'friction' },
  CHECKOUT_VALIDATION_FAILED:{ label: 'Formulaire refusé', famille: 'friction' },
  CHECKOUT_CART_EMPTY:  { label: 'Paiement ouvert, panier vide', famille: 'friction' },
  PROMO_CODE_FAILED:    { label: 'Code promo refusé', famille: 'friction' },
  OTP_DELIVERY_FAILED:  { label: 'Code JAMAIS reçu', famille: 'friction' },
  SEARCH_ZERO_RESULTS:  { label: 'Ne trouve rien', famille: 'friction' },
  SEARCH_ABANDONED:     { label: 'Abandonne sa recherche', famille: 'friction' },
  RAGE_CLICK:           { label: 'Clique en rafale (agacement)', famille: 'friction' },
  DEAD_CLICK:           { label: 'Clique dans le vide', famille: 'friction' },
  JS_ERROR:             { label: 'Erreur technique', famille: 'friction' },

  /* Bruit ambiant */
  SCROLL_DEPTH:         { label: 'Fait défiler', famille: 'bruit' },
  PAGE_VIEW_DURATION:   { label: 'Temps passé sur la page', famille: 'bruit' },
  WEB_VITALS:           { label: 'Mesure de vitesse', famille: 'bruit' },
  SESSION_END:          { label: 'Fin de visite', famille: 'bruit' },
}

/**
 * LE BRUIT AMBIANT — masqué par défaut, jamais supprimé.
 *
 * La liste est EXPLICITE et ne se déduit pas de la famille. `PRODUCT_IMPRESSION`
 * appartient à la découverte — c'est sa couleur — mais reste du bruit : une
 * seule page de marque en produit vingt en deux secondes. Vérifié à l'écran en
 * le déduisant de la famille : la chronologie annonçait « 74 actions marquantes
 * sur 106 » et le récit disparaissait de nouveau sous les impressions.
 *
 * Famille = couleur. Bruit = volume. Deux questions différentes.
 */
export const BRUIT = new Set([
  'PRODUCT_IMPRESSION',
  'SCROLL_DEPTH',
  'PAGE_VIEW_DURATION',
  'WEB_VITALS',
  'SESSION_END',
  'RECOMMENDATIONS_SHOWN',
  'STICKY_CTA_SHOWN',
])

const nb = (v: unknown) => (v == null || v === '' ? null : Number(v))
const mad = (v: unknown) => {
  const n = nb(v)
  return n == null || !Number.isFinite(n) ? null : `${Math.round(n).toLocaleString('fr-FR')} MAD`
}
const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Le libellé d'un élément cliqué est l'`innerText` brut de la cible : on recolle
 * les mots collés par la concaténation, on écrase les espaces multiples.
 * On NE COUPE PLUS : les détails wrappent maintenant au lieu de truncate.
 */
const propre = (v: unknown, max = 120) => {
  const s = txt(v)
  if (!s) return null
  let net = s
    .replace(/([a-zà-ÿ0-9])([A-ZÀ-Ý])/g, '$1 $2')
    .replace(/([A-ZÀ-Ý]{2,})([A-ZÀ-Ý][a-zà-ÿ])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  /* « Cheveux SecsCheveux Secs » — un lien qui porte un libellé visible ET un
     doublon pour lecteur d'écran ressort doublé dans l'`innerText`. Constaté sur
     la moitié des CLICK_UI de navigation. On ne garde qu'une moitié quand les
     deux sont rigoureusement identiques. */
  const demi = (net.length - 1) / 2
  if (Number.isInteger(demi) && net[demi] === ' ' && net.slice(0, demi) === net.slice(demi + 1)) {
    net = net.slice(0, demi)
  } else if (net.length % 2 === 0 && net.slice(0, net.length / 2) === net.slice(net.length / 2)) {
    net = net.slice(0, net.length / 2)
  }
  return net.length > max ? `${net.slice(0, max)}…` : net
}

/** Le motif d'un départ, en clair. Partagé par le détail et le diagnostic. */
const MOTIF_DEPART: Record<string, string> = {
  visibility_hidden: 'a basculé sur autre chose',
  beforeunload: 'a fermé la page',
  unmount: 'a quitté le tunnel',
  navigate: 'est partie ailleurs',
}

/** Les champs du formulaire, en français. Partagé détail / diagnostic. */
const CHAMPS: Record<string, string> = {
  name: 'nom', phone: 'téléphone', address: 'adresse',
  city: 'ville', district: 'quartier', notes: 'notes',
}

/** Les étapes du tunnel, en français. */
const ETAPES: Record<string, string> = {
  delivery: 'livraison', summary: 'récapitulatif',
  contact: 'coordonnées', payment: 'paiement',
}

/** Le nom d'étagère, en français. */
const CONTEXTE: Record<string, string> = {
  category: 'rayon catégorie', home: 'accueil', brand: 'page marque',
  search: 'résultats de recherche', related: 'produits liés',
  cart: 'panier', checkout: 'paiement', bundle: 'pack',
}

/**
 * LE DÉTAIL D'UNE LIGNE, construit depuis les `props` réelles de l'évènement.
 *
 * Chaque cas est écrit à la main parce qu'un rendu générique (« clé : valeur »)
 * redonnerait le JSON qu'on cherche justement à traduire. Ce qui compte n'est
 * pas d'afficher toutes les propriétés, c'est d'afficher CELLE qui explique
 * l'action — le prix pour un ajout, le motif pour un refus, le nombre de
 * résultats pour une recherche.
 */
export function detail(e: Evenement): string | null {
  const p = e.props || {}
  const morceaux: Array<string | null> = []
  const nom = txt(p.name)

  switch (e.name) {
    case 'PRODUCT_ADD_TO_CART':
    case 'PRODUCT_REMOVE_FROM_CART': {
      const q = nb(p.qtyDelta)
      morceaux.push(nom, mad(p.price))
      if (q != null && Math.abs(q) > 1) morceaux.push(`×${Math.abs(q)}`)
      const c = nb(p.cartCount), t = nb(p.cartTotal)
      if (c != null && t != null) morceaux.push(`panier : ${c} article${c > 1 ? 's' : ''}, ${mad(t)}`)
      if (e.name === 'PRODUCT_REMOVE_FROM_CART' && txt(p.reason) === 'decrease_to_zero') morceaux.push('quantité descendue à zéro')
      break
    }
    case 'PRODUCT_VIEW_DETAIL': {
      morceaux.push(nom, mad(p.price))
      const orig = nb(p.origPrice), prix = nb(p.price)
      if (orig != null && prix != null && orig > prix) morceaux.push(`au lieu de ${mad(orig)}`)
      if (p.inStock === false) morceaux.push('EN RUPTURE')
      const r = nb(p.rating)
      if (r != null && r > 0) morceaux.push(`noté ${r.toFixed(1).replace('.', ',')}`)
      break
    }
    case 'PRODUCT_CLICK':
    case 'PRODUCT_IMPRESSION': {
      morceaux.push(nom, mad(p.price))
      const pos = nb(p.position), ctx = txt(p.context)
      if (ctx) {
        const c = CONTEXTE[ctx] ?? ctx
        morceaux.push(pos != null ? `${c}, position ${pos + 1}` : c)
      }
      break
    }
    case 'BRAND_VIEW':
      morceaux.push(txt(p.brand), nb(p.productCount) != null ? `${nb(p.productCount)} produits` : null)
      break
    case 'SEARCH_QUERY':
    case 'SEARCH_SUBMIT':
    case 'SEARCH_ABANDONED': {
      const q = txt(p.query)
      const n = nb(p.resultsCount)
      morceaux.push(q ? `« ${q} »` : null)
      if (n != null) morceaux.push(n === 0 ? 'AUCUN résultat' : `${n} résultat${n > 1 ? 's' : ''}`)
      if (e.name === 'SEARCH_ABANDONED') morceaux.push('repart sans cliquer')
      break
    }
    case 'SEARCH_ZERO_RESULTS':
      morceaux.push(txt(p.query) ? `« ${txt(p.query)} » — le catalogue ne répond pas` : null)
      break
    case 'SEARCH_RESULT_CLICK':
      morceaux.push(nom, mad(p.price), txt(p.query) ? `cherché « ${txt(p.query)} »` : null)
      break
    case 'RECOMMENDATION_CLICKED': {
      const motif: Record<string, string> = {
        same_brand: 'même marque', same_category: 'même catégorie',
        frequently_bought: 'souvent achetés ensemble', similar: 'similaire',
      }
      const r = txt(p.reason)
      morceaux.push(r ? `suggestion « ${motif[r] ?? r} »` : 'suggestion')
      if (nb(p.position) != null) morceaux.push(`position ${(nb(p.position) ?? 0) + 1}`)
      break
    }
    case 'PRODUCT_CONTENT_SECTION_CLICK': {
      const sections: Record<string, string> = {
        usage: 'Comment l’utiliser', ingredients: 'Composition',
        description: 'Description', reviews: 'Avis',
      }
      const s = txt(p.section)
      morceaux.push(s ? (sections[s] ?? s) : null, nom)
      break
    }
    case 'PRODUCT_GALLERY_BROWSED':
      morceaux.push(nb(p.images) != null ? `${nb(p.images)} photos parcourues` : null)
      break
    case 'VIEW_CART': {
      const c = nb(p.cartCount)
      morceaux.push(c != null ? `${c} article${c > 1 ? 's' : ''}` : null, mad(p.cartTotal))
      break
    }
    case 'BEGIN_CHECKOUT':
    case 'CHECKOUT_STEP': {
      const s = txt(p.step)
      morceaux.push(s ? `étape ${ETAPES[s] ?? s}` : null)
      const n = nb(p.itemsCount) ?? nb(p.numItems)
      if (n != null) morceaux.push(`${n} article${n > 1 ? 's' : ''}`)
      morceaux.push(mad(p.cartTotal ?? p.value))
      // `contents` porte le détail ligne à ligne : on montre les prix unitaires,
      // c'est ce qui permet de voir SUR QUOI elle hésite.
      const lignes = Array.isArray(p.contents) ? (p.contents as Array<Record<string, unknown>>) : []
      if (lignes.length) {
        morceaux.push(lignes.map((l) => {
          const q = nb(l.quantity) ?? 1
          const pu = mad(l.item_price)
          return `#${txt(l.id) ?? '?'}${q > 1 ? `×${q}` : ''}${pu ? ` à ${pu}` : ''}`
        }).join(', '))
      }
      break
    }
    case 'DELIVERY_CITY_SELECTED': {
      morceaux.push(txt(p.city))
      const f = nb(p.deliveryFee)
      if (f != null) morceaux.push(f === 0 ? 'livraison offerte' : `livraison ${mad(f)}`)
      const reste = nb(p.remainingForFreeDelivery)
      if (reste != null && reste > 0) morceaux.push(`${mad(reste)} avant la gratuité`)
      break
    }
    case 'DELIVERY_FEE_SHOWN': {
      const f = nb(p.fee)
      morceaux.push(txt(p.ville), f === 0 ? 'offerte' : mad(f))
      const reste = nb(p.resteAvantGratuite)
      if (reste != null && reste > 0) morceaux.push(`${mad(reste)} avant la gratuité`)
      break
    }
    case 'ADD_PAYMENT_INFO': {
      // Cet évènement ne porte PAS de ville (vérifié en base) : ne rien
      // inventer, il porte le total final et le détail des lignes.
      const n = nb(p.numItems) ?? nb(p.itemsCount)
      if (n != null) morceaux.push(`${n} article${n > 1 ? 's' : ''}`)
      morceaux.push(mad(p.finalTotal ?? p.value))
      break
    }
    case 'PLACE_ORDER': {
      morceaux.push(txt(p.city) ? `vers ${txt(p.city)}` : null)
      const n = nb(p.itemsCount) ?? nb(p.numItems)
      if (n != null) morceaux.push(`${n} article${n > 1 ? 's' : ''}`)
      const panier = nb(p.cartTotal), final = nb(p.finalTotal)
      morceaux.push(mad(final ?? p.value))
      // L'écart panier → total final EST le prix de la livraison. C'est le
      // dernier chiffre qu'elle voit avant de valider : il mérite d'être lu.
      if (panier != null && final != null && final !== panier) {
        const d = final - panier
        morceaux.push(d > 0 ? `dont ${mad(d)} de livraison` : `remise ${mad(-d)}`)
      }
      if (txt(p.promoCode)) morceaux.push(`code ${txt(p.promoCode)}`)
      const pts = nb(p.pointsUsed)
      if (pts != null && pts > 0) morceaux.push(`${pts} points utilisés`)
      break
    }
    case 'PURCHASE_SUCCESS':
    case 'ORDER_CREATED': {
      const id = nb(p.orderId)
      morceaux.push(id != null ? `commande n°${id}` : null, mad(p.finalTotal ?? p.total))
      const liv = nb(p.deliveryFee)
      if (liv != null && liv > 0) morceaux.push(`dont ${mad(liv)} de livraison`)
      const rem = nb(p.discount ?? p.pointsDiscount)
      if (rem != null && rem > 0) morceaux.push(`remise ${mad(rem)}`)
      const pts = nb(p.pointsEarned)
      if (pts != null && pts > 0) morceaux.push(`+${pts} points`)
      break
    }
    case 'PURCHASE_FAILED':
      morceaux.push(txt(p.error), mad(p.finalTotal) ? `${mad(p.finalTotal)} en jeu` : null)
      break
    case 'CHECKOUT_VALIDATION_FAILED': {
      const champs = Array.isArray(p.missingFields) ? (p.missingFields as string[]) : []
      const s = txt(p.step)
      morceaux.push(s ? `étape ${ETAPES[s] ?? s}` : null)
      if (champs.length) morceaux.push(`manque : ${champs.map((c) => CHAMPS[c] ?? c).join(', ')}`)
      break
    }
    case 'CHECKOUT_ABANDONED': {
      const s = txt(p.step)
      morceaux.push(s ? `à l’étape ${ETAPES[s] ?? s}` : null)
      morceaux.push(txt(p.reason) ? (MOTIF_DEPART[txt(p.reason)!] ?? txt(p.reason)) : null)
      morceaux.push(mad(p.cartValue) ? `${mad(p.cartValue)} abandonnés` : null)
      // Les NOMS des produits laissés : c'est ce qu'on veut savoir pour la
      // relancer, et `products` les porte déjà.
      const prods = Array.isArray(p.products) ? (p.products as Array<Record<string, unknown>>) : []
      if (prods.length) {
        morceaux.push(prods.map((x) => {
          const q = nb(x.quantity) ?? 1
          return `${propre(x.name, 60)}${q > 1 ? ` ×${q}` : ''} (${mad(x.price)})`
        }).join(' + '))
      }
      if (p.hasPromo === true) morceaux.push('avait un code promo')
      break
    }
    case 'CHECKOUT_FIELD_ABANDON': {
      const c = txt(p.champ)
      const s = txt(p.step)
      morceaux.push(c ? `champ « ${CHAMPS[c] ?? c} »` : null)
      morceaux.push(s ? `étape ${ETAPES[s] ?? s}` : null)
      morceaux.push(txt(p.reason) ? (MOTIF_DEPART[txt(p.reason)!] ?? txt(p.reason)) : null)
      morceaux.push(mad(p.cartValue) ? `${mad(p.cartValue)} en jeu` : null)
      break
    }
    case 'PROMO_CODE_APPLIED':
      morceaux.push(txt(p.code), mad(p.discountAmount) ? `−${mad(p.discountAmount)}` : null)
      break
    case 'PROMO_CODE_FAILED': {
      const c = txt(p.code) || ''
      morceaux.push(c ? `« ${c.length > 28 ? c.slice(0, 28) + '…' : c} »` : null, txt(p.error))
      break
    }
    case 'USE_POINTS': {
      const pts = nb(p.pointsUsed)
      morceaux.push(pts != null ? `${pts} points` : null, mad(p.discountMad) ? `−${mad(p.discountMad)}` : null)
      break
    }
    case 'OTP_DELIVERY_FAILED':
      morceaux.push(txt(p.channel), txt(p.errorCode) ? `code ${txt(p.errorCode)}` : null)
      break
    case 'CART_CLEAR': {
      const c = nb(p.cartCountBefore)
      morceaux.push(c != null ? `${c} article${c > 1 ? 's' : ''} retirés` : null, mad(p.cartTotalBefore))
      if (txt(p.source) === 'order_success') morceaux.push('après la commande — normal')
      break
    }
    case 'CLICK_UI':
    case 'DEAD_CLICK':
    case 'RAGE_CLICK': {
      // On affiche ET le label ET l'id pour mieux identifier l'élément.
      const label = propre(p.label)
      const id = txt(p.id)
      const balise: Record<string, string> = { a: 'lien', button: 'bouton', input: 'champ', select: 'liste' }
      const t = txt(p.tag)
      if (label && id && label !== id) morceaux.push(`${label} [${id}]`)
      else morceaux.push(label || id)
      morceaux.push(t ? (balise[t] ?? t) : null)
      break
    }
    case 'SESSION_START': {
      const ref = txt(p.referrer)
      if (ref) {
        try { morceaux.push(`vient de ${new URL(ref).hostname.replace(/^www\./, '')}`) }
        catch { morceaux.push(`vient de ${ref.slice(0, 40)}`) }
      }
      break
    }
    case 'SESSION_RETURNING':
      morceaux.push(p.nouvelle === true ? 'première visite' : 'déjà venue')
      break
    case 'SCROLL_DEPTH':
      morceaux.push(nb(p.pct) != null ? `${nb(p.pct)} % de la page` : null)
      break
    case 'PAGE_VIEW_DURATION': {
      const s = nb(p.durationSeconds)
      morceaux.push(s != null ? (s < 60 ? `${s} s` : `${Math.round(s / 60)} min`) : null)
      break
    }
    case 'WEB_VITALS': {
      const v = nb(p.value)
      morceaux.push(txt(p.metric), v != null ? `${Math.round(v)} ms` : null, txt(p.verdict))
      break
    }
    case 'CLICK_WHATSAPP':
      morceaux.push(txt(p.source) === 'fixed_button' ? 'bouton flottant' : txt(p.source))
      break
    default:
      morceaux.push(nom || txt(p.query) || txt(p.champ) || txt(p.label))
  }

  const s = morceaux.filter(Boolean).join(' · ')
  return s || null
}

/**
 * DIAGNOSTIC DE BLOCAGE — ce qui a empêché la conversion, en une phrase.
 *
 * C'est ce qui manquait : une session de 37 lignes se lit mal action par action,
 * mais « Bloquée sur le champ quartier » se lit d'un coup d'œil.
 *
 * Trois passes, dans cet ordre :
 *   1. Elle a commandé → il n'y a rien à diagnostiquer, on se tait.
 *   2. La DERNIÈRE friction de la session, où qu'elle soit. Chercher seulement
 *      dans les huit dernières lignes ratait le cas courant : la friction a lieu
 *      au paiement, puis vingt lignes de navigation la repoussent hors fenêtre.
 *   3. À défaut, le stade du tunnel atteint — un blocage muet reste un blocage.
 *
 * `montant` est séparé du `quoi` : la valeur en jeu décide si ça vaut un rappel.
 */
type Blocage = { quoi: string; montant: string | null }

/** Les frictions, du signal le plus explicite au plus vague. */
const FRICTIONS = new Set([
  'PURCHASE_FAILED', 'OTP_DELIVERY_FAILED', 'CHECKOUT_FIELD_ABANDON',
  'CHECKOUT_VALIDATION_FAILED', 'PROMO_CODE_FAILED', 'CHECKOUT_ABANDONED',
  'CHECKOUT_CART_EMPTY', 'RAGE_CLICK', 'DEAD_CLICK', 'SEARCH_ZERO_RESULTS',
  'JS_ERROR', 'CART_CLEAR',
])

function diagnosticBlockage(evenements: Evenement[]): Blocage | null {
  // 1. Commande passée : aucune friction ne l'a empêchée d'aboutir.
  if (evenements.some((e) => e.name === 'PURCHASE_SUCCESS' || e.name === 'ORDER_CREATED')) return null

  // 2. La dernière friction de toute la session.
  for (let i = evenements.length - 1; i >= 0; i--) {
    const e = evenements[i]
    if (!FRICTIONS.has(e.name)) continue
    const p = e.props || {}
    const valeur = mad(p.cartValue ?? p.finalTotal ?? p.cartTotal ?? p.cartTotalBefore)
    const etape = txt(p.step)
    const suffixe = etape ? ` (étape ${ETAPES[etape] ?? etape})` : ''

    switch (e.name) {
      case 'PURCHASE_FAILED':
        return { quoi: `Commande REFUSÉE par le site — ${txt(p.error) ?? 'motif inconnu'}`, montant: valeur }
      case 'OTP_DELIVERY_FAILED':
        return { quoi: `Code de vérification jamais reçu${txt(p.channel) ? ` (${txt(p.channel)})` : ''}`, montant: valeur }
      case 'CHECKOUT_FIELD_ABANDON': {
        const c = txt(p.champ)
        return { quoi: `Bloquée sur le champ « ${c ? CHAMPS[c] ?? c : '?'} »${suffixe}`, montant: valeur }
      }
      case 'CHECKOUT_VALIDATION_FAILED': {
        const m = Array.isArray(p.missingFields) ? (p.missingFields as string[]) : []
        return {
          quoi: m.length
            ? `Formulaire refusé — manque : ${m.map((c) => CHAMPS[c] ?? c).join(', ')}${suffixe}`
            : `Formulaire refusé${suffixe}`,
          montant: valeur,
        }
      }
      case 'PROMO_CODE_FAILED':
        return { quoi: `Code promo « ${txt(p.code) ?? '?'} » refusé — ${txt(p.error) ?? 'invalide'}`, montant: valeur }
      case 'CHECKOUT_ABANDONED': {
        const motif = txt(p.reason) ? MOTIF_DEPART[txt(p.reason)!] ?? txt(p.reason) : null
        return { quoi: `Quitte le paiement${suffixe}${motif ? ` — ${motif}` : ''}`, montant: valeur }
      }
      case 'CHECKOUT_CART_EMPTY':
        return { quoi: 'Arrive au paiement avec un panier VIDE — le panier s’est perdu en route', montant: null }
      case 'CART_CLEAR':
        // Un panier vidé après commande est normal ; ici il n'y a pas eu de commande.
        return { quoi: 'A vidé son panier', montant: mad(p.cartTotalBefore) }
      case 'RAGE_CLICK':
        return { quoi: `Clique en rafale sur « ${propre(p.label, 60) ?? txt(p.id) ?? '?'} » — quelque chose ne répond pas`, montant: valeur }
      case 'DEAD_CLICK':
        return { quoi: `Clique dans le vide sur « ${propre(p.label, 60) ?? txt(p.id) ?? '?'} »`, montant: valeur }
      case 'SEARCH_ZERO_RESULTS':
        return { quoi: `Cherche « ${txt(p.query) ?? '?'} » — le catalogue ne répond pas`, montant: null }
      case 'JS_ERROR':
        return { quoi: `Erreur technique — ${propre(p.message, 80) ?? 'script en échec'}`, montant: valeur }
    }
  }

  // 3. Aucun signal explicite : dire jusqu'où elle est allée.
  const a = (n: string) => evenements.some((e) => e.name === n)
  const dernierPanier = [...evenements].reverse().find((e) => nb(e.props?.cartTotal) != null)
  const valeurPanier = dernierPanier ? mad(dernierPanier.props.cartTotal) : null

  /* LA RUPTURE DE STOCK N'ÉMET AUCUN ÉVÈNEMENT DE FRICTION — elle se lit dans
     `inStock: false` d'une fiche produit. C'est pourtant le blocage le plus net
     qui soit : elle a voulu, elle n'a pas pu. Sans ce test, la session ressort
     en « a ouvert 3 fiches sans rien mettre au panier », ce qui donne l'air
     d'une hésitation alors que c'est le catalogue qui a dit non. */
  if (!a('PRODUCT_ADD_TO_CART')) {
    const rupture = evenements.find((e) => e.name === 'PRODUCT_VIEW_DETAIL' && e.props?.inStock === false)
    if (rupture) {
      return {
        quoi: `A regardé « ${propre(rupture.props.name, 70) ?? 'un produit'} » — EN RUPTURE, elle ne pouvait pas l’acheter`,
        montant: mad(rupture.props.price),
      }
    }
  }

  if (a('PLACE_ORDER'))
    return { quoi: 'A envoyé la commande, mais aucune confirmation n’est revenue — à vérifier côté serveur', montant: valeurPanier }
  if (a('ADD_PAYMENT_INFO') || a('BEGIN_CHECKOUT') || a('CLICK_CHECKOUT_FROM_CART'))
    return { quoi: 'A démarré le paiement sans le finir — part sans rien dire', montant: valeurPanier }
  if (a('PRODUCT_ADD_TO_CART'))
    return { quoi: 'A mis au panier sans jamais ouvrir le paiement', montant: valeurPanier }
  /* PAS DE DIAGNOSTIC SANS MATIÈRE.
     Une visite de cinq secondes ne « bloque » rien : personne n'a eu le temps
     d'y renoncer. Le module annonçait pourtant « a ouvert 1 fiche produit sans
     rien mettre au panier » pour une visiteuse venue d'une publicité et repartie
     aussitôt — un rebond présenté comme un échec du site, ce qui envoie corriger
     une fiche produit alors que le problème est en amont, dans le ciblage.

     LE SEUIL N'EST PAS QU'UN CHRONOMÈTRE, ET C'EST VOULU. Mesuré sur 412 vraies
     mises au panier : 5 % surviennent dans la seconde qui suit l'ouverture de la
     fiche, 25 % en moins de 7,4 s. Écarter sur la seule durée excuserait donc des
     sessions où une acheteuse aurait largement eu le temps d'agir. On exige les
     trois signes réunis d'une visite sans contenu : aucun défilement, une seule
     page, et moins de dix secondes. Dès qu'un seul manque, le diagnostic normal
     reprend la main — mieux vaut un blocage annoncé de trop qu'un blocage tu. */
  const instants = evenements.map((e) => Date.parse(e.at)).filter((n) => Number.isFinite(n))
  const secondes = instants.length > 1 ? (Math.max(...instants) - Math.min(...instants)) / 1000 : 0
  const pages = new Set(evenements.map((e) => e.path).filter(Boolean)).size
  if (!a('SCROLL_DEPTH') && pages <= 1 && secondes < 10) {
    return {
      quoi: `Repartie au bout de ${Math.round(secondes)} s, sans faire défiler — trop court pour conclure`,
      montant: null,
    }
  }

  if (a('PRODUCT_VIEW_DETAIL')) {
    const n = evenements.filter((e) => e.name === 'PRODUCT_VIEW_DETAIL').length
    return { quoi: `A ouvert ${n} fiche${n > 1 ? 's' : ''} produit sans rien mettre au panier`, montant: null }
  }
  return { quoi: 'Repart sans ouvrir la moindre fiche produit', montant: null }
}

/** Une session, ligne par ligne. */
function changementsDePage(evenements: Evenement[]): boolean[] {
  let precedente = ''
  return evenements.map((e) => {
    const page = (e.path || '').split('?')[0]
    const change = Boolean(page && page !== precedente)
    if (page) precedente = page
    return change
  })
}

export function Chronologie({ evenements }: { evenements: Evenement[] }) {
  const heure = (iso: string) =>
    new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Africa/Casablanca' })
      .format(new Date(iso))

  const blocage = diagnosticBlockage(evenements)
  const nouvellesPages = changementsDePage(evenements)

  return (
    <div>
      {blocage && (
        <div className="mb-2 px-2.5 py-1.5 rounded-[5px] flex items-baseline gap-2 flex-wrap"
          style={{ background: FAMILLES.friction.fond, borderInlineStart: `3px solid ${FAMILLES.friction.couleur}` }}>
          <span className="text-[9px] font-bold uppercase tracking-wide flex-shrink-0"
            style={{ color: FAMILLES.friction.couleur }}>
            Ce qui a bloqué
          </span>
          <span className="text-[11px] font-semibold break-words" style={{ color: FAMILLES.friction.couleur }}>
            {blocage.quoi}
          </span>
          {blocage.montant && (
            <span className="text-[10px] tabular-nums flex-shrink-0" style={{ color: V.muted }}>
              · {blocage.montant} en jeu
            </span>
          )}
        </div>
      )}
      <ol className="space-y-[1px]">
        {evenements.map((e, i) => {
          const s = SENS[e.name] ?? { label: e.name, famille: 'arrivee' as Famille }
          const f = FAMILLES[s.famille]
          const d = detail(e)
          const page = (e.path || '').split('?')[0]
          const nouvellePage = nouvellesPages[i]

          return (
            <li key={i} className="text-[10px] rounded-[4px] px-1.5 py-1"
              style={{ background: f.fond, borderInlineStart: `2px solid ${f.couleur}` }}>
              <div className="flex items-start gap-2">
                {/* Heure compacte à gauche */}
                <span className="tabular-nums flex-shrink-0 w-[52px] pt-[1px] text-[9px]" style={{ color: V.muted }}>
                  {heure(e.at)}
                </span>
                {/* Action + détails wrappés, pas tronqués */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="font-semibold" style={{ color: f.couleur }}>{s.label}</span>
                    {d && (
                      <span className="break-words" style={{ color: V.ink }}>
                        {d}
                      </span>
                    )}
                  </div>
                  {/* Page en dessous si changement, monospace gris, pas tronquée */}
                  {nouvellePage && (
                    <div className="mt-0.5 font-mono text-[9px] break-all" style={{ color: V.muted }}>
                      {e.path || page}
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** La légende des couleurs — sans elle, sept teintes ne veulent rien dire. */
export function LegendeFamilles() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {(Object.keys(FAMILLES) as Famille[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1 text-[11px]" style={{ color: V.muted }}>
          <span aria-hidden="true" style={{
            width: 8, height: 8, borderRadius: 2, background: FAMILLES[k].couleur, display: 'inline-block',
          }} />
          {FAMILLES[k].label}
        </span>
      ))}
    </div>
  )
}
