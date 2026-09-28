import 'server-only'
import pool from '@/lib/db'
import { performancePubs, strategie } from './agent'
import { verdicts } from './conseils'
import { reveillerDirecteur } from './declencher'
import { AMBIANCES, A_MONTRER, BORNES, ETAPES_SITE, FONDS, OBJECTIFS, OFFRES, RECETTES, LIBELLES_SITE, LivraisonDirection, MOUVEMENTS, OptionLivreeSchema, RetoucheSchema, STYLES, TRANSITIONS, VEUT_SITE, consignesBrief, sujetDemande, validerDemande, verifierLivraison, verifierMontage, verifierOption, type DemandeDirection, type OptionLivree, type Retouche, type Style, type TypeDirection } from './direction-model'
import { capturesSite, charpentesRecentes, lecons, packsDe, reglesBoutique, type CapturesProduit } from './apprentissage'
import { FORMATS_IMAGE } from './creatif-model'
import { urlDetouree } from './reel-model'

/**
 * LE DIRECTEUR ARTISTIQUE, COTE BOS. Claude ecrit les consignes, OpenAI peint.
 *
 * 1. Achraf envoie un brief (options ou carrousel, format, styles, qualite)
 *    → une demande « direction » dans la file de l'agent, et la routine est
 *    reveillee si le declencheur est configure (lib/ads/declencher.ts).
 * 2. La routine Claude reclame la demande, lit son contexte (vraies photos
 *    produit, creation, strategie, pubs qui marchent, directions passees),
 *    regarde les photos, ecrit les options ou les cartes et les livre ici.
 * 3. Elle fait generer chaque visuel (lib/ads/images.ts, option par option),
 *    les regarde, regenere ceux qui sont rates, note son controle, et clot.
 */

type Json = Record<string, unknown>
const texteSeul = (html: string | null) => (html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const MAX_EN_ATTENTE = 3

/** Une photo de fiche a 1024 px en JPEG : ce que Claude regarde avant d'ecrire. */
function photo(url: string | null): string | null {
  if (!url) return null
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/.exec(url)
  return m ? `${m[1]}c_limit,w_1024,h_1024,f_jpg,q_85/${m[2].replace(/^(?:[a-z]_[^/]*\/)+/, '')}` : url
}

export async function demanderDirection(entree: unknown, par: string | null) {
  const d = validerDemande(entree)
  if (d.creatifId) {
    const c = await pool.query(`SELECT id FROM "AdsCreative" WHERE id = $1`, [d.creatifId])
    if (!c.rowCount) throw new Error('Création introuvable.')
  } else {
    const p = await pool.query<{ n: number }>(`SELECT count(*)::int n FROM "Product" WHERE id = ANY($1::int[])`, [d.produitIds])
    if (p.rows[0].n !== d.produitIds!.length) throw new Error('Un des produits choisis n’existe pas.')
  }
  const n = await pool.query<{ n: number }>(`SELECT count(*)::int n FROM "AdsAgentRequest" WHERE genre = 'direction' AND statut IN ('en_attente', 'en_cours')`)
  if (n.rows[0].n >= MAX_EN_ATTENTE) throw new Error(`${MAX_EN_ATTENTE} directions sont déjà en cours : attends que le directeur artistique en livre une.`)
  const r = await pool.query(
    `INSERT INTO "AdsAgentRequest" (genre, sujet, demande_par, creatif_id, parametres) VALUES ('direction', $1, $2, $3, $4::jsonb)
     RETURNING id, genre, sujet, statut, demande_le, creatif_id, parametres`,
    [sujetDemande(d), par, d.creatifId ?? null, JSON.stringify(d)])
  const demande = r.rows[0]
  return { demande, lancee: await reveillerDirecteur(demande.id) }
}

type DemandeEnCours = { id: number; genre: string; statut: string; sujet: string; creatif_id: number | null; parametres: DemandeDirection; retouche: Retouche | null; demande_par: string | null }

async function demandeEnCours(id: number): Promise<DemandeEnCours> {
  const r = await pool.query(`SELECT id, genre, statut, sujet, creatif_id, parametres, demande_par FROM "AdsAgentRequest" WHERE id = $1`, [id])
  const x = r.rows[0]
  if (!x) throw new Error('Demande inconnue.')
  if (x.genre !== 'direction') throw new Error('Ce n’est pas une demande de direction artistique.')
  if (x.statut !== 'en_cours') throw new Error('Cette demande n’est pas en cours : réclame-la d’abord (bos.mjs demande --direction).')
  // Une retouche (« refais ce plan ») n'est pas un brief : elle vise une option existante.
  if (x.parametres?.retouche) return { ...x, parametres: null as unknown as DemandeDirection, retouche: RetoucheSchema.parse(x.parametres.retouche) }
  return { ...x, parametres: validerDemande(x.parametres) as DemandeDirection, retouche: null }
}

/** Les produits qu'un Reel peut animer : ceux de la creation, et les produits de ses packs. */
async function produitsAnimables(produitIds: number[]) {
  const packs = await packsDe(produitIds)
  return { packs, ids: [...new Set([...produitIds, ...Object.values(packs).flat()])] }
}

/** Les vrais avis (approuves, avec un commentaire) des produits qu'une creation peut montrer. */
async function avisReels(produits: number[]) {
  if (!produits.length) return []
  const r = await pool.query(
    `SELECT r.id, r."productId" AS produit, r.rating AS note, trim(r.comment) AS texte FROM "Review" r
     WHERE r.approved AND r."productId" = ANY($1::int[]) AND length(trim(coalesce(r.comment, ''))) >= 4 ORDER BY r.rating DESC, r."createdAt" DESC LIMIT 20`, [produits])
  return r.rows as { id: number; produit: number; note: number; texte: string }[]
}
/** L'avis d'un plan : recopie tel quel de la table des avis (le directeur artistique ne l'ecrit pas). */
async function resoudreAvis(avisId: number | undefined, produits: number[]) {
  if (!avisId) return undefined
  const a = (await avisReels(produits)).find((x) => x.id === avisId)
  if (!a) throw new Error(`Avis #${avisId} introuvable parmi les avis approuvés de ces produits : prends un id de « avisReels ».`)
  return { id: a.id, texte: a.texte, note: a.note }
}

/** Un plan « site » ne montre que des ecrans vraiment captures (scripts/ads/captures-site.mjs). */
function verifierCaptures(options: Pick<OptionLivree, 'mouvement' | 'animes' | 'ecrans'>[], captures: Record<number, CapturesProduit>) {
  options.forEach((o, i) => {
    if (o.mouvement !== 'site') return
    const id = o.animes?.[0] ?? 0
    const manque = (o.ecrans ?? []).filter((e) => !captures[id]?.[e])
    if (manque.length) throw new Error(`Plan ${i + 1} : pas de capture du site pour le produit #${id} (${manque.join(', ')}). Les captures existent pour : ${Object.keys(captures).map((k) => `#${k}`).join(', ') || 'aucun produit'}.`)
  })
}

/** Tout ce dont Claude a besoin pour diriger : le brief, la creation, les vrais produits, ce qui marche deja. */
export async function contexteDirection(demandeId: number) {
  const dem = await demandeEnCours(demandeId)
  if (dem.retouche) return contexteRetouche(dem)
  const p = dem.parametres
  const creation = dem.creatif_id
    ? (await pool.query(`SELECT id, angle, format, public, accroche, script, texte_fr, texte_darija, texte_ar, titre, cta, visuel, produit_ids FROM "AdsCreative" WHERE id = $1`, [dem.creatif_id])).rows[0] ?? null
    : null
  const produitIds: number[] = creation ? creation.produit_ids : p.produitIds ?? []
  const { packs, ids: animables } = await produitsAnimables(produitIds)
  const [produits, s, pubs, passees, captures, charpentes, retours, boutique, avis] = await Promise.all([
    animables.length
      ? pool.query(`SELECT id, name AS nom, brand AS marque, category AS categorie, price AS prix, image, description, benefits,
                           (coalesce(stock, 0) + coalesce("virtualStock", 0)) AS stock_vendable FROM "Product" WHERE id = ANY($1::int[])`, [animables])
      : Promise.resolve({ rows: [] as Json[] }),
    strategie(),
    performancePubs(),
    dem.creatif_id
      ? pool.query(`SELECT o.serie, o.carte, o.concept, o.prompt, o.note, (SELECT url FROM "AdsCreativeImage" i WHERE i.option_id = o.id ORDER BY i.choisie DESC, i.cree_le DESC LIMIT 1) AS visuel
                    FROM "AdsCreativeOption" o WHERE o.creatif_id = $1 ORDER BY o.serie DESC, o.carte NULLS FIRST, o.id LIMIT 20`, [dem.creatif_id])
      : Promise.resolve({ rows: [] as Json[] }),
    capturesSite(animables),
    charpentesRecentes(5),
    lecons(),
    reglesBoutique(),
    avisReels(animables),
  ])
  const composantDe = new Map(Object.entries(packs).flatMap(([pack, comps]) => comps.map((c) => [c, Number(pack)] as const)))
  const v = verdicts(pubs, s.config.regles.depenseMinAvantVerdict)
  const qui = pubs.filter((x) => v[x.adId]?.verdict === 'gagnante').slice(0, 5)
  return {
    demande: {
      id: dem.id, sujet: dem.sujet, ...p, stylesSouhaites: p.styles.map((x: string) => STYLES[x as Style]).filter(Boolean),
      // Ce que la pub doit obtenir, l'offre, ce qui DOIT se voir (le BOS le verifie a la livraison).
      objectifDetail: p.objectif ? OBJECTIFS[p.objectif] : null, offreDetail: OFFRES[p.offre], aMontrer: p.montrer.map((k) => A_MONTRER[k]),
      // La recette choisie par Achraf : suis sa charpente plan par plan (le BOS la verifie) ; tu ecris les textes et choisis les schemas.
      recetteDetail: p.recette ? RECETTES[p.recette] : null,
    },
    // Les vraies regles du site : n'annonce que ces chiffres (livraison, code de bienvenue, paiement).
    boutique,
    // Les VRAIS avis des produits (plan « zoom » + « avisId ») : le BOS recopie le texte exact, tu n'ecris pas de citation.
    avisReels: avis,
    formats: Object.fromEntries(Object.entries(FORMATS_IMAGE).map(([k, f]) => [k, { taille: f.taille, label: f.label }])),
    bornes: BORNES[p.type],
    mouvements: p.type === 'reel' ? MOUVEMENTS : undefined,
    // Les fonds Shine dessines par le BOS (« fond » d'un plan) : pas d'image a peindre. demande.fond === 'shine' : obligatoires partout.
    fonds: p.type === 'reel' ? FONDS : undefined,
    creation,
    // Les retours d'Achraf : ils priment sur la doctrine et sur tes habitudes.
    leconsAchraf: retours.map((x) => x.texte),
    // Le brief, consigne par consigne : chacune doit etre tenue (« couverture » dans la livraison).
    consignes: consignesBrief(p.brief),
    // Les charpentes des derniers Reels : n'en reprends aucune, et ne les ouvre pas pareil.
    reelsRecents: charpentes.map((x) => ({ creation: x.creatifId, suite: x.suite.join(' → '), accroche: x.accroche })),
    // Les vraies captures du tunnel d'achat, par produit (plan « site » : animes = [ce produit]).
    captures: Object.fromEntries(Object.entries(captures).map(([id, c]) => [id, ETAPES_SITE.filter((e) => c[e]).map((e) => ({ ecran: e, bouton: c[e]!.bouton, libelleParDefaut: LIBELLES_SITE[e], image: c[e]!.url }))])),
    siteDemande: VEUT_SITE.test(p.brief ?? ''),
    // L'economie reelle d'un pack : la somme des prix d'AUJOURD'HUI de ses produits moins le prix du pack. Le Reel #18
    // disait « moins cher que séparément » alors que les 4 soins coûtaient 997 DH, comme le pack.
    packs: Object.fromEntries(Object.entries(packs).map(([pack, comps]) => {
      const prixDe = (id: number) => Number((produits.rows as Json[]).find((x) => x.id === id)?.prix ?? 0)
      const somme = Math.round(comps.reduce((n, id) => n + prixDe(id), 0)), prixPack = Math.round(prixDe(Number(pack)))
      const economie = somme - prixPack
      return [pack, {
        produits: comps, prixPack, sommeDesProduitsAujourdhui: somme, economie,
        regle: `Anime ces ${comps.length} produits eux-mêmes (pas la photo du pack) et montre-les TOUS dans un plan « etapes », « pop » ou « fin ». ${economie > 0
          ? `Le pack fait économiser ${economie} DH par rapport à ses produits achetés séparément aujourd'hui.`
          : `Le pack coûte AUTANT que ses produits achetés séparément aujourd'hui : n'écris jamais « moins cher que séparément », « économise » ni « offert » ; son prix barré est le prix de référence, dis « au lieu de » seulement avec ce prix-là.`}`,
      }]
    })),
    produits: (produits.rows as Json[]).map((x) => ({
      id: x.id, nom: x.nom, marque: x.marque, categorie: x.categorie, prix: Number(x.prix), stockVendable: Number(x.stock_vendable),
      ...(packs[x.id as number] ? { pack: packs[x.id as number] } : {}),
      ...(composantDe.has(x.id as number) ? { dansLePack: composantDe.get(x.id as number) } : {}),
      photo: photo(x.image as string | null),
      // Ce que le Reel anime : la meme photo, detouree par Cloudinary (fond transparent).
      detouree: urlDetouree(x.image as string | null),
      page: `https://www.shinecosmetics.ma/products/${x.id}`,
      description: texteSeul(x.description as string | null).slice(0, 700),
      bienfaits: (Array.isArray(x.benefits) ? (x.benefits as Json[]) : []).map((b) => String(b.titleFR || b.title || '')).filter(Boolean).slice(0, 6),
    })),
    strategie: { ton: s.config.ton, public: s.config.public, langues: s.config.langues, offres: s.config.offres, produitsExclus: s.config.produitsExclus },
    pubsQuiMarchent: qui.map((x) => ({ nom: x.nom, texte: x.texte, vignette: x.vignette, raison: v[x.adId].raison })),
    directionsPassees: passees.rows,
  }
}

/** Claude livre ses options (ou cartes) : on cree la creation si besoin, on enregistre la serie. */
export async function enregistrerDirection(entree: unknown) {
  const p = LivraisonDirection.safeParse(entree)
  if (!p.success) throw new Error(p.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' · '))
  const l = p.data
  const dem = await demandeEnCours(l.demandeId)
  if (dem.retouche) throw new Error('Cette demande est une retouche : modifie le plan avec « bos.mjs option <id> », puis « termine ».')
  const d = dem.parametres
  const creationExistante = dem.creatif_id
    ? (await pool.query(`SELECT id, produit_ids FROM "AdsCreative" WHERE id = $1`, [dem.creatif_id])).rows[0]
    : null
  const produitsCreation: number[] = creationExistante ? creationExistante.produit_ids : d.produitIds ?? []
  const { packs, ids: animables } = await produitsAnimables(produitsCreation)
  const [captures, charpentes] = await Promise.all([capturesSite(animables), charpentesRecentes(5)])
  verifierLivraison(l, d, animables, Boolean(creationExistante), {
    packs, recents: charpentes.map((x) => x.suite), siteDispo: Object.values(captures).some((c) => Object.keys(c).length >= 2),
    avisDispo: (await avisReels(animables)).length > 0,
  })
  verifierCaptures(l.options, captures)
  const avisDe = new Map<number, { id: number; texte: string; note: number }>()
  for (const o of l.options) if (o.avisId) avisDe.set(o.avisId, (await resoudreAvis(o.avisId, animables))!)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let creatifId: number = creationExistante?.id
    if (!creatifId) {
      const c = l.creation!
      const ins = await client.query(
        `INSERT INTO "AdsCreative" (produit_ids, angle, format, public, accroche, texte_fr, texte_darija, texte_ar, titre, cta, visuel)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [produitsCreation, c.angle, d.type === 'options' ? 'image' : d.type, c.public || null, c.accroche, c.texteFr || null, c.texteDarija || null,
          c.texteAr || null, c.titre || null, c.cta || null, l.style])
      creatifId = ins.rows[0].id
      await client.query(`UPDATE "AdsAgentRequest" SET creatif_id = $2 WHERE id = $1`, [dem.id, creatifId])
    }
    if (l.couverture?.length) await client.query(`UPDATE "AdsAgentRequest" SET couverture = $2::jsonb WHERE id = $1`, [dem.id, JSON.stringify(l.couverture)])
    const serie = (await client.query(`SELECT coalesce(max(serie), 0) + 1 AS n FROM "AdsCreativeOption" WHERE creatif_id = $1`, [creatifId])).rows[0].n as number
    const options = []
    for (const [i, o] of l.options.entries()) {
      const r = await client.query(
        `INSERT INTO "AdsCreativeOption" (creatif_id, demande_id, serie, carte, role, concept, pourquoi, prompt, texte, position, format, produit_ids, animes, mouvement, duree, style, brief, qualite, modele, motion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb) RETURNING id, carte, concept, mouvement`,
        [creatifId, dem.id, serie, d.type === 'options' ? null : i + 1, o.role || (d.type === 'carrousel' ? `carte ${i + 1}` : d.type === 'reel' ? `plan ${i + 1}` : `option ${i + 1}`),
          o.concept, o.pourquoi, o.prompt, JSON.stringify(o.texte), o.position, d.format, o.produitIds === undefined ? null : o.produitIds,
          d.type === 'reel' ? o.animes ?? [] : null, d.type === 'reel' ? o.mouvement : null, d.type === 'reel' ? o.duree : null,
          l.style, d.brief || null, d.qualite, l.modele || null,
          d.type === 'reel' ? JSON.stringify({ transition: o.transition ?? 'coupe', ambiance: o.ambiance ?? 'aucune', bulles: o.bulles ?? [], points: o.points ?? [], choix: o.choix ?? [], voix: o.voix ?? null, confiance: o.confiance ?? [], prix: o.prix ?? false, ...(o.ecrans ? { ecrans: o.ecrans } : {}), ...(o.fond ? { fond: o.fond } : {}), ...(o.ouvert ? { ouvert: true } : {}), ...(o.melange ? { melange: true } : {}), ...(o.lettres ? { lettres: true } : {}), ...(o.appel ? { appel: o.appel } : {}), ...(o.illustration ? { illustration: o.illustration } : {}), ...(o.cache ? { cache: true } : {}), ...(o.avisId ? { avis: avisDe.get(o.avisId) } : {}) }) : null])
      options.push(r.rows[0])
    }
    await client.query('COMMIT')
    return { creatifId, serie, qualite: d.qualite, options }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function terminerDirection(id: number, resultat: string) {
  await demandeEnCours(id)
  await pool.query(`UPDATE "AdsAgentRequest" SET statut = 'termine', termine_le = now(), resultat = left($2, 3000) WHERE id = $1`, [id, resultat.trim() || 'Direction livrée.'])
  return { id }
}

/* ------------------------------------------------------------------ */
/* LA TABLE DE MONTAGE : Achraf retouche plan par plan                  */
/* ------------------------------------------------------------------ */

type LigneOption = Json & { id: number; creatif_id: number; serie: number; carte: number | null; mouvement: string | null; duree: string | number | null; motion: Json | null }

async function serieDe(o: LigneOption) {
  const serie = (await pool.query(`SELECT * FROM "AdsCreativeOption" WHERE creatif_id = $1 AND serie = $2 ORDER BY carte NULLS FIRST, id`, [o.creatif_id, o.serie])).rows as LigneOption[]
  const type: TypeDirection = serie.some((x) => x.mouvement) ? 'reel' : serie.some((x) => x.carte != null) ? 'carrousel' : 'options'
  const creation: number[] = (await pool.query(`SELECT produit_ids FROM "AdsCreative" WHERE id = $1`, [o.creatif_id])).rows[0]?.produit_ids ?? []
  // Un Reel d'un pack anime aussi les produits du pack.
  const { ids: produits } = await produitsAnimables(creation)
  return { serie, type, produits }
}

/** Une ligne de la base, remise dans la forme que Claude livre (pour la valider avec les memes regles). */
function enLivree(x: LigneOption): Json {
  const m = (x.motion ?? {}) as Json
  return {
    role: x.role ?? '', concept: x.concept, pourquoi: x.pourquoi || 'Retouché à la main dans la table de montage.', prompt: x.prompt, texte: x.texte, position: x.position,
    produitIds: x.produit_ids ?? undefined, animes: x.animes ?? undefined, mouvement: x.mouvement ?? undefined, duree: x.duree == null ? undefined : Number(x.duree),
    transition: m.transition, ambiance: m.ambiance, bulles: m.bulles, points: m.points, choix: m.choix, voix: m.voix ?? undefined,
    confiance: m.confiance ?? undefined, prix: m.prix ?? undefined, ecrans: m.ecrans ?? undefined, fond: m.fond ?? undefined, ouvert: m.ouvert ?? undefined, melange: m.melange ?? undefined, lettres: m.lettres ?? undefined, appel: m.appel ?? undefined,
    illustration: m.illustration ?? undefined, cache: m.cache ?? undefined, avisId: (m.avis as { id?: number } | undefined)?.id ?? undefined,
  }
}

const CHAMPS_PLAN = ['texte', 'position', 'prompt', 'animes', 'mouvement', 'duree', 'transition', 'ambiance', 'bulles', 'points', 'choix', 'voix', 'confiance', 'prix', 'ecrans', 'fond', 'ouvert', 'melange', 'lettres', 'appel', 'illustration', 'cache', 'avisId'] as const

/**
 * Retoucher un plan (ou une option, une carte) : textes, animation, duree,
 * transition, ambiance, produits, bulles, atouts, reponses, voix off, consigne.
 * La meme validation que la livraison de Claude : pas de francais sans accents,
 * pas de DM illisible, pas de duo a trois produits.
 */
export async function modifierPlan(id: number, patch: Json) {
  const o = (await pool.query(`SELECT * FROM "AdsCreativeOption" WHERE id = $1`, [id])).rows[0] as LigneOption | undefined
  if (!o) throw new Error('Plan introuvable.')
  // Une simple note de controle ne revalide pas tout le plan.
  if (Object.keys(patch).every((k) => k === 'id' || k === 'note')) {
    const u = await pool.query(`UPDATE "AdsCreativeOption" SET note = $2, maj_le = now() WHERE id = $1 RETURNING *`, [id, typeof patch.note === 'string' ? patch.note.trim().slice(0, 1500) || null : o.note])
    return u.rows[0]
  }
  const { serie, type, produits } = await serieDe(o)
  const fusion = enLivree(o)
  for (const k of CHAMPS_PLAN) if (patch[k] !== undefined) fusion[k] = patch[k]
  const p = OptionLivreeSchema.safeParse(fusion)
  if (!p.success) throw new Error(p.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' · '))
  const plan = p.data
  const index = Math.max(0, serie.findIndex((x) => x.id === id))
  verifierOption(plan, index, type, produits)
  if (plan.mouvement === 'site') verifierCaptures([plan], await capturesSite(plan.animes))
  const avisPlan = await resoudreAvis(plan.avisId, produits)
  if (type === 'reel') verifierMontage(serie.map((x) => (x.id === id ? plan.duree ?? 0 : Number(x.duree) || 0)))
  const ancien = (o.motion ?? {}) as Json
  const motion = type === 'reel'
    ? { ...ancien, transition: plan.transition ?? 'coupe', ambiance: plan.ambiance ?? 'aucune', bulles: plan.bulles ?? [], points: plan.points ?? [], choix: plan.choix ?? [], voix: plan.voix ?? ancien.voix ?? null, confiance: plan.confiance ?? [], prix: plan.prix ?? false, ecrans: plan.mouvement === 'site' ? plan.ecrans ?? [] : undefined, fond: plan.fond ?? 'decor', ouvert: plan.mouvement === 'quiz' ? plan.ouvert ?? false : undefined, melange: plan.mouvement === 'pop' ? plan.melange ?? false : undefined, lettres: plan.lettres ?? false, appel: plan.appel ?? null, illustration: plan.mouvement === 'zoom' ? plan.illustration ?? null : null, cache: plan.cache ?? false, avis: avisPlan ?? null }
    : o.motion
  const note = typeof patch.note === 'string' ? patch.note.trim().slice(0, 1500) || null : o.note
  const u = await pool.query(
    `UPDATE "AdsCreativeOption" SET texte = $2::jsonb, position = $3, prompt = $4, animes = $5, mouvement = $6, duree = $7, motion = $8::jsonb, note = $9, maj_le = now()
     WHERE id = $1 RETURNING *`,
    [id, JSON.stringify(plan.texte), plan.position, plan.prompt, type === 'reel' ? plan.animes ?? [] : null, type === 'reel' ? plan.mouvement : null,
      type === 'reel' ? plan.duree : null, motion == null ? null : JSON.stringify(motion), note])
  return u.rows[0]
}

/** Renumerote les cartes d'une serie dans l'ordre donne ; le premier plan d'un Reel entre toujours en coupe franche. */
async function renumeroter(client: { query: typeof pool.query }, ids: number[]) {
  for (const [k, id] of ids.entries()) {
    await client.query(`UPDATE "AdsCreativeOption" SET carte = $2,
      motion = CASE WHEN $2 = 1 AND motion IS NOT NULL THEN jsonb_set(motion, '{transition}', '"coupe"') ELSE motion END, maj_le = now() WHERE id = $1`, [id, k + 1])
  }
}

export async function deplacerPlan(id: number, sens: -1 | 1) {
  const o = (await pool.query(`SELECT * FROM "AdsCreativeOption" WHERE id = $1`, [id])).rows[0] as LigneOption | undefined
  if (!o) throw new Error('Plan introuvable.')
  if (o.carte == null) throw new Error('Seuls les cartes et les plans ont un ordre.')
  const { serie } = await serieDe(o)
  const ids = serie.map((x) => x.id)
  const i = ids.indexOf(id), j = i + sens
  if (j < 0 || j >= ids.length) return { ids }
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  await renumeroter(pool, ids)
  return { ids }
}

export async function dupliquerPlan(id: number) {
  const o = (await pool.query(`SELECT * FROM "AdsCreativeOption" WHERE id = $1`, [id])).rows[0] as LigneOption | undefined
  if (!o) throw new Error('Plan introuvable.')
  const { serie, type } = await serieDe(o)
  if (type === 'carrousel' && serie.length >= 10) throw new Error('Un carrousel a 10 cartes au plus.')
  if (type === 'reel' && serie.length >= 8) throw new Error('8 plans au plus : au-delà, le Reel perd l’attention.')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const copie = (await client.query(
      `INSERT INTO "AdsCreativeOption" (creatif_id, demande_id, serie, carte, role, concept, pourquoi, prompt, texte, position, format, produit_ids, animes, mouvement, duree, style, brief, qualite, modele, motion)
       SELECT creatif_id, demande_id, serie, carte, role, concept || ' (copie)', pourquoi, prompt, texte, position, format, produit_ids, animes, mouvement, duree, style, brief, qualite, modele,
              CASE WHEN motion IS NULL THEN NULL ELSE motion - 'voixUrl' END
       FROM "AdsCreativeOption" WHERE id = $1 RETURNING id`, [id])).rows[0].id as number
    if (o.carte != null) {
      const ids = serie.map((x) => x.id)
      ids.splice(ids.indexOf(id) + 1, 0, copie)
      await renumeroter(client, ids)
    }
    await client.query('COMMIT')
    return { id: copie }
  } catch (e) { await client.query('ROLLBACK'); throw e } finally { client.release() }
}

export async function supprimerPlan(id: number) {
  const o = (await pool.query(`SELECT * FROM "AdsCreativeOption" WHERE id = $1`, [id])).rows[0] as LigneOption | undefined
  if (!o) throw new Error('Plan introuvable.')
  const { serie, type } = await serieDe(o)
  if (type !== 'options' && serie.length <= 2) throw new Error('Il faut au moins 2 plans ou cartes : supprime plutôt la série entière.')
  // Les visuels deja generes restent dans la galerie (option_id passe a NULL) : on ne jette pas une image payee.
  await pool.query(`DELETE FROM "AdsCreativeOption" WHERE id = $1`, [id])
  if (o.carte != null) await renumeroter(pool, serie.filter((x) => x.id !== id).map((x) => x.id))
  return { id }
}

/** « Refais ce plan » : une demande ciblee au directeur artistique, avec la note d'Achraf. */
export async function demanderRetouche(entree: unknown, par: string | null) {
  const p = RetoucheSchema.safeParse(entree)
  if (!p.success) throw new Error(p.error.issues.map((i) => i.message).join(' · '))
  const o = (await pool.query(`SELECT id, creatif_id, carte, concept FROM "AdsCreativeOption" WHERE id = $1`, [p.data.optionId])).rows[0]
  if (!o) throw new Error('Plan introuvable.')
  const n = await pool.query<{ n: number }>(`SELECT count(*)::int n FROM "AdsAgentRequest" WHERE genre = 'direction' AND statut IN ('en_attente', 'en_cours')`)
  if (n.rows[0].n >= MAX_EN_ATTENTE) throw new Error(`${MAX_EN_ATTENTE} demandes sont déjà en cours chez le directeur artistique.`)
  const sujet = `Retouche ${o.carte ? `du plan ${o.carte}` : 'd’une option'} (« ${o.concept} ») — ${p.data.note}`.slice(0, 1500)
  const r = await pool.query(
    `INSERT INTO "AdsAgentRequest" (genre, sujet, demande_par, creatif_id, parametres) VALUES ('direction', $1, $2, $3, $4::jsonb)
     RETURNING id, genre, sujet, statut, demande_le, creatif_id, parametres`,
    [sujet, par, o.creatif_id, JSON.stringify({ retouche: p.data })])
  return { demande: r.rows[0], lancee: await reveillerDirecteur(r.rows[0].id) }
}

/** Le contexte d'une retouche : le plan vise, toute sa serie (pour rester coherent), la creation, les vrais produits. */
async function contexteRetouche(dem: DemandeEnCours) {
  const r = dem.retouche!
  const o = (await pool.query(`SELECT * FROM "AdsCreativeOption" WHERE id = $1`, [r.optionId])).rows[0] as LigneOption | undefined
  if (!o) throw new Error('Le plan à retoucher n’existe plus.')
  const { serie, type, produits: produitIds } = await serieDe(o)
  const [creation, produits] = await Promise.all([
    pool.query(`SELECT id, angle, format, public, accroche, texte_fr, texte_darija, texte_ar, titre, cta, produit_ids FROM "AdsCreative" WHERE id = $1`, [o.creatif_id]),
    produitIds.length
      ? pool.query(`SELECT id, name AS nom, brand AS marque, image, description FROM "Product" WHERE id = ANY($1::int[])`, [produitIds])
      : Promise.resolve({ rows: [] as Json[] }),
  ])
  const visuel = async (id: number) => (await pool.query(`SELECT id, url FROM "AdsCreativeImage" WHERE option_id = $1 ORDER BY choisie DESC, cree_le DESC LIMIT 1`, [id])).rows[0] ?? null
  return {
    demande: { id: dem.id, sujet: dem.sujet, retouche: r },
    consigne: 'RETOUCHE : ne change que ce que la note demande. Modifie le plan avec « bos.mjs option <optionId> patch.json » (memes champs que la livraison : texte, mouvement, duree, animes, transition, ambiance, bulles, points, choix, voix, prompt). Si le decor doit changer, reecris « prompt » puis regenere l’image (« image --option »). Termine par « termine <id> ».',
    type, planVise: { ...enLivree(o), id: o.id, carte: o.carte, visuel: await visuel(o.id) },
    serie: await Promise.all(serie.map(async (x) => ({ id: x.id, carte: x.carte, ...enLivree(x), visuel: await visuel(x.id) }))),
    creation: creation.rows[0] ?? null,
    produits: (produits.rows as Json[]).map((x) => ({ id: x.id, nom: x.nom, marque: x.marque, photo: photo(x.image as string | null), detouree: urlDetouree(x.image as string | null), description: texteSeul(x.description as string | null).slice(0, 500) })),
    mouvements: type === 'reel' ? MOUVEMENTS : undefined, transitions: type === 'reel' ? TRANSITIONS : undefined, ambiances: type === 'reel' ? AMBIANCES : undefined,
  }
}

export async function supprimerSerie(creatifId: number, serie: number) {
  // Les visuels deja generes restent dans la galerie (option_id passe a NULL) : on ne jette pas une image payee.
  const r = await pool.query(`DELETE FROM "AdsCreativeOption" WHERE creatif_id = $1 AND serie = $2`, [creatifId, serie])
  return { supprimees: r.rowCount }
}
