import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { getOpsSession } from '@/lib/auth'
import type { LigneSuivi } from '@/lib/avis-suivi'

export const dynamic = 'force-dynamic'

// Même motif que la boutique (lib/winback.ts → MOTIF_DESINSCRIPTION) : « Ne plus recevoir d'offres », « stop »…
const MOTIF_DESINSCRIPTION = String.raw`(ne plus recevoir|^\s*stop\y|d[ée]sinscri|arr[eê]te[zr]? (les|de)|توقف|بلا عروض)`

/**
 * LE SUIVI DES DEMANDES D'AVIS : chaque cliente déjà sollicitée, sur sa demande
 * en cours (dernier lien d'avis) — messages partis, reçus, lus, lien ouvert
 * (clic enregistré ou visite de /avis/<lien>), avis laissés et publiés, bonus.
 * Lecture seule.
 */
export async function GET() {
  if (!(await getOpsSession())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  const r = await pool.query<LigneSuivi>(`
    WITH dj AS (
      SELECT DISTINCT ON ("userId") id, token, "userId", "productIds", "rewardGranted", "createdAt", "clickedAt"
      FROM "ReviewToken" ORDER BY "userId", id DESC
    ), msgs AS (
      SELECT m."userId",
        count(*) FILTER (WHERE m.status IN ('sent', 'delivered', 'read'))::int AS envoyes,
        count(*) FILTER (WHERE m.status = 'failed')::int AS echecs,
        coalesce(bool_or(m.status IN ('delivered', 'read')), false) AS recu,
        coalesce(bool_or(m.status = 'read'), false) AS lu,
        max(m."createdAt") AS dernier,
        (array_agg(m."errorCode" ORDER BY m."createdAt" DESC) FILTER (WHERE m.status = 'failed'))[1] AS erreur
      FROM "MessageLog" m JOIN dj ON dj."userId" = m."userId"
      WHERE m.type = 'review' AND m.direction = 'out' AND m."createdAt" >= dj."createdAt"
      GROUP BY m."userId"
    ), visites AS (
      -- Le lien arrive parfois avec « {{1}} » devant le jeton (selon le client WhatsApp).
      SELECT DISTINCT regexp_replace(split_part(path, '?', 1), '^/avis/(%7B%7B1%7D%7D|\\{\\{1\\}\\})?', '') AS token
      FROM "AnalyticsEvent" WHERE path LIKE '/avis/%'
    ), avis AS (
      SELECT dj."userId", count(DISTINCT r."productId")::int AS laisses,
        count(DISTINCT r."productId") FILTER (WHERE r.approved)::int AS publies
      FROM dj JOIN "Review" r ON r."userId" = dj."userId" AND r."productId" = ANY(dj."productIds")
      GROUP BY dj."userId"
    )
    SELECT u.id AS "userId", u.name, u.phone, dj."createdAt" AS "demandeLe", cardinality(dj."productIds")::int AS produits,
      dj."rewardGranted" AS paye, coalesce(m.envoyes, 0) AS envoyes, coalesce(m.echecs, 0) AS echecs,
      coalesce(m.recu, false) AS recu, coalesce(m.lu, false) AS lu, m.dernier AS "dernierMessage", m.erreur,
      (dj."clickedAt" IS NOT NULL OR v.token IS NOT NULL) AS ouvert,
      coalesce(a.laisses, 0) AS laisses, coalesce(a.publies, 0) AS publies,
      EXISTS (SELECT 1 FROM "MessageLog" x WHERE x.direction = 'in' AND (x."userId" = u.id OR x.phone = u.phone) AND x.body ~* $1) AS desinscrite
    FROM dj JOIN "User" u ON u.id = dj."userId"
    LEFT JOIN msgs m ON m."userId" = dj."userId"
    LEFT JOIN visites v ON v.token = dj.token
    LEFT JOIN avis a ON a."userId" = dj."userId"
    ORDER BY coalesce(m.dernier, dj."createdAt") DESC`, [MOTIF_DESINSCRIPTION])
  return NextResponse.json({ lignes: r.rows }, { headers: { 'Cache-Control': 'no-store' } })
}
