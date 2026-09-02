import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { cachedAnalytics } from '@/lib/analytics-cache'
import { analyticsError, analyticsQuery } from '@/lib/analytics/db'
import {
  construireSql, assembler, mesuresBrutes, sourcesRequises,
  problemeCompatibilite, DIMENSIONS, MESURES, type Requete, type Ligne,
} from '@/lib/analytics/model'

/**
 * LE POINT D'ENTREE UNIQUE.
 *
 * L'ancienne route `store` renvoyait ~40 cles figees en 1 489 lignes : ajouter
 * une vue voulait dire ajouter une requete, et corriger une definition voulait
 * dire la corriger a plusieurs endroits — d'ou les trois cartographies de canal
 * contradictoires qu'on y a trouvees.
 *
 * Ici, une requete decrit CE QU'ON VEUT (une dimension, des mesures, une
 * periode, des filtres) et le modele semantique sait comment l'obtenir. Le
 * serveur ne connait aucune carte : il ne connait que le modele.
 *
 * POST /api/ops/analytics/query
 *   { dimension?, mesures[], periode{debut,fin}, comparaison?, filtres?, basis?, limite? }
 */

export const dynamic = 'force-dynamic'

type BrutParCle = Record<string, Record<string, number>>

/**
 * Une requete par SOURCE, puis recollage sur la valeur de dimension.
 *
 * On ne joint pas les evenements aux commandes : 61 % des commandes ne passent
 * jamais par le site (DM Instagram et WhatsApp saisis a la main). Une jointure
 * ferait disparaitre les deux tiers du chiffre d'affaires — ou pire, les
 * dupliquerait. Chaque source repond pour elle, et les lignes se rejoignent sur
 * la dimension.
 */
async function executer(req: Requete, periode: { debut: string; fin: string }): Promise<BrutParCle> {
  const brut: BrutParCle = {}
  const cles = mesuresBrutes(req.mesures)

  const resultats: Array<Array<Record<string, unknown>>> = []
  // Les pages ouvrent souvent deux rapports à la fois. Séquencer les sources
  // évite un pic de connexions Neon sans ajouter de calcul ni de coût durable.
  for (const source of sourcesRequises(req.mesures)) {
    const q = construireSql(source, req, periode)
    if (!q) continue
    const r = await analyticsQuery(q.texte, q.params)
    resultats.push(r.rows as Array<Record<string, unknown>>)
  }

  for (const rows of resultats) {
    for (const row of rows as Array<Record<string, unknown>>) {
      const k = String(row.cle ?? '(tous)')
      brut[k] = brut[k] || {}
      for (const c of cles) if (row[c] != null) brut[k][c] = Number(row[c])
    }
  }
  return brut
}

function valide(body: unknown): { ok: true; req: Requete } | { ok: false; erreur: string } {
  const b = body as Partial<Requete> | null
  if (!b || typeof b !== 'object') return { ok: false, erreur: 'Corps de requête invalide' }
  if (!Array.isArray(b.mesures) || b.mesures.length === 0) return { ok: false, erreur: 'Aucune mesure demandée' }

  // Liste blanche stricte : rien de ce qui arrive du client n'atteint le SQL
  // autrement que par une cle connue du modele.
  const mesures = b.mesures.filter((m) => typeof m === 'string' && MESURES[m])
  if (mesures.length === 0) return { ok: false, erreur: 'Mesures inconnues' }
  if (b.dimension && !DIMENSIONS[b.dimension]) return { ok: false, erreur: `Dimension inconnue : ${b.dimension}` }

  const d = b.periode?.debut, f = b.periode?.fin
  const dateOk = (v: unknown) => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
    const parsed = new Date(`${v}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v
  }
  if (!dateOk(d) || !dateOk(f)) return { ok: false, erreur: 'Période invalide (AAAA-MM-JJ attendu)' }
  const jours = (Date.parse(`${f}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000
  if (jours < 0) return { ok: false, erreur: 'La date de fin précède la date de début' }
  if (jours > 731) return { ok: false, erreur: 'La période est limitée à deux ans' }
  if (b.comparaison && (!dateOk(b.comparaison.debut) || !dateOk(b.comparaison.fin))) {
    return { ok: false, erreur: 'Comparaison invalide' }
  }
  if (b.comparaison) {
    const cmpJours = (Date.parse(`${b.comparaison.fin}T00:00:00Z`) - Date.parse(`${b.comparaison.debut}T00:00:00Z`)) / 86_400_000
    if (cmpJours < 0 || cmpJours > 731) return { ok: false, erreur: 'Comparaison invalide' }
  }

  /* `Array.isArray` et pas `?? []` : sur un corps malforme — `filtres: {}` —
     l'appel a `.filter` levait une exception happee plus haut, et la route
     repondait 500 « Erreur serveur ». Un corps invalide doit rendre 400 et dire
     ce qui ne va pas ; un 500 fait chercher la panne du mauvais cote. */
  if (b.filtres != null && !Array.isArray(b.filtres)) {
    return { ok: false, erreur: 'Filtres invalides' }
  }
  const filtres = (b.filtres ?? []).filter(
    (x) => x && DIMENSIONS[x.dimension] && Array.isArray(x.valeurs) && x.valeurs.length > 0
  )
  if ((b.filtres ?? []).length !== filtres.length) {
    return { ok: false, erreur: 'Un filtre contient une dimension ou une valeur invalide' }
  }

  const req: Requete = {
    dimension: b.dimension,
    mesures,
    periode: { debut: d as string, fin: f as string },
    comparaison: b.comparaison,
    filtres,
    basis: b.basis === 'cash' ? 'cash' : 'cohorte',
    limite: typeof b.limite === 'number' ? Math.min(Math.max(1, b.limite), 500) : undefined,
  }
  const probleme = problemeCompatibilite(req)
  if (probleme) return { ok: false, erreur: probleme }

  return {
    ok: true,
    req,
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    if (!token || token.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const v = valide(await request.json())
    if (!v.ok) return NextResponse.json({ error: v.erreur }, { status: 400 })
    const req = v.req

    // La cle de cache decrit la requete entiere : deux vues differentes ne
    // peuvent pas se voler leur resultat.
    const cle = 'q:' + JSON.stringify([
      req.dimension ?? '', req.mesures, req.periode, req.comparaison ?? '',
      req.filtres, req.basis, req.limite ?? 0,
    ])

    const { data, cachedAt } = await cachedAnalytics(cle, 5 * 60 * 1000, async () => {
      const courant = await executer(req, req.periode)
      const precedent = req.comparaison ? await executer(req, req.comparaison) : undefined
      const lignes: Ligne[] = assembler(req, courant, precedent)

      return {
        lignes,
        // Le modele voyage avec la reponse : l'interface n'a pas a redefinir ce
        // qu'est une mesure, ni comment la mettre en forme, ni ce qu'elle veut
        // dire. C'est ce qui permet l'infobulle de definition sans duplication.
        modele: {
          dimension: req.dimension ? DIMENSIONS[req.dimension] : null,
          mesures: req.mesures.map((c) => {
            const m = MESURES[c]
            return {
              cle: m.cle, label: m.label, definition: m.definition,
              format: m.format, portee: m.portee, hausseEstBonne: m.hausseEstBonne,
              seuil: m.seuil ?? null,
              // Une mesure DERIVEE ne s'additionne pas : la somme des « marges
              // par commande » de chaque canal ne veut rien dire. L'interface a
              // besoin de le savoir pour ne pas remplir sa ligne de totaux avec
              // un nombre faux — c'est exactement ce qu'elle affichait.
              derivee: m.sql === null,
            }
          }),
        },
        periode: req.periode,
        comparaison: req.comparaison ?? null,
      }
    }, { fresh: request.nextUrl.searchParams.get('fresh') === '1' })

    return NextResponse.json({ ...data, cachedAt })
  } catch (e) {
    console.error('[analytics/query]', analyticsError(e))
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

/** Le catalogue des champs — ce qui alimente le sélecteur façon Looker. */
export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  if (!token || token.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    dimensions: Object.values(DIMENSIONS).map((d) => ({
      cle: d.cle, label: d.label, definition: d.definition,
      sources: Object.keys(d.sql),
    })),
    mesures: Object.values(MESURES).map((m) => ({
      cle: m.cle, label: m.label, definition: m.definition,
      format: m.format, portee: m.portee, source: m.source,
      hausseEstBonne: m.hausseEstBonne, derivee: m.sql === null,
    })),
  })
}
