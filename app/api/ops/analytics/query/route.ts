import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import pool from '@/lib/db'
import { cachedAnalytics } from '@/lib/analytics-cache'
import {
  construireSql, assembler, mesuresBrutes, sourcesRequises,
  DIMENSIONS, MESURES, type Requete, type Ligne,
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

  const resultats = await Promise.all(
    sourcesRequises(req.mesures).map(async (source) => {
      const q = construireSql(source, req, periode)
      if (!q) return []
      const r = await pool.query(q.texte, q.params as string[])
      return r.rows
    })
  )

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
  const dateOk = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  if (!dateOk(d) || !dateOk(f)) return { ok: false, erreur: 'Période invalide (AAAA-MM-JJ attendu)' }
  if (b.comparaison && (!dateOk(b.comparaison.debut) || !dateOk(b.comparaison.fin))) {
    return { ok: false, erreur: 'Comparaison invalide' }
  }

  const filtres = (b.filtres ?? []).filter(
    (x) => x && DIMENSIONS[x.dimension] && Array.isArray(x.valeurs) && x.valeurs.length > 0
  )

  return {
    ok: true,
    req: {
      dimension: b.dimension,
      mesures,
      periode: { debut: d as string, fin: f as string },
      comparaison: b.comparaison,
      filtres,
      basis: b.basis === 'cash' ? 'cash' : 'cohorte',
      limite: typeof b.limite === 'number' ? Math.min(Math.max(1, b.limite), 500) : undefined,
    },
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
      req.dimension ?? '', req.mesures.slice().sort(), req.periode, req.comparaison ?? '',
      req.filtres, req.basis, req.limite ?? 0,
    ])

    const { data, cachedAt } = await cachedAnalytics(cle, 5 * 60 * 1000, async () => {
      const [courant, precedent] = await Promise.all([
        executer(req, req.periode),
        req.comparaison ? executer(req, req.comparaison) : Promise.resolve(undefined),
      ])
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
    console.error('[analytics/query]', e instanceof Error ? e.message : e)
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
