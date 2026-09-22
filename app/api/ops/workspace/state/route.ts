import { NextRequest, NextResponse } from 'next/server'
import * as Y from 'yjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/workspace/state?name=page:1 → { state: base64 } | { state: null }
 *
 * LE CONTENU NE DOIT PAS DEPENDRE DU SERVEUR TEMPS-REEL POUR S'AFFICHER.
 *
 * L'etat Yjs vit dans "WorkspaceDoc", et le BOS lit cette base directement.
 * Pourtant, quand le serveur de collaboration ne repondait pas, l'editeur
 * affichait une page VIERGE : il n'attendait son contenu que de lui. Le
 * fondateur a cru ses donnees perdues alors que ses 80 Ko etaient a deux
 * requetes de la.
 *
 * Cette route sert donc l'etat depuis la base, comme filet. Yjs fusionne sans
 * jamais supprimer : l'appliquer localement puis recevoir l'etat du serveur
 * converge vers le meme document, il ne peut pas en naitre de doublon.
 */
export const dynamic = 'force-dynamic'

/** Session du fondateur, OU le serveur de collaboration avec son jeton partage. */
async function autorise(req: NextRequest): Promise<boolean> {
  const jeton = process.env.REALTIME_TOKEN
  if (jeton && req.headers.get('authorization') === `Bearer ${jeton}`) return true
  const s = await getServerSession(authOptions)
  return Boolean(s?.user?.email)
}

export async function GET(req: NextRequest) {
  if (!(await autorise(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const name = req.nextUrl.searchParams.get('name') || ''
  if (!/^page:\d+$/.test(name)) return NextResponse.json({ error: 'bad_name' }, { status: 400 })

  const r = await pool.query('SELECT data FROM "WorkspaceDoc" WHERE name = $1', [name])
  const data: Buffer | undefined = r.rows[0]?.data
  return NextResponse.json(
    { state: data ? Buffer.from(data).toString('base64') : null, bytes: data ? data.length : 0 },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}


/**
 * POST /api/ops/workspace/state  { name, update: base64 } → { bytes }
 *
 * SAUVEGARDER SANS LE SERVEUR TEMPS-REEL.
 *
 * La persistance passait uniquement par le serveur de collaboration. Quand il
 * n'atteint plus la base -- ce qui est arrive le 2026-07-20, et n'a ete vu que
 * deux mois plus tard -- plus rien n'etait enregistre, en silence. Le BOS parle
 * pourtant a la meme base.
 *
 * ON FUSIONNE, ON N'ECRASE PAS. L'etat stocke est relu, l'update y est
 * applique, et le resultat est reecrit. C'est la garantie de Yjs : deux
 * editions concurrentes convergent, aucune ne supprime l'autre. Ecrire l'etat
 * du client tel quel ferait perdre ce qu'un autre aurait ajoute entre-temps.
 */
export async function POST(req: NextRequest) {
  if (!(await autorise(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const corps = await req.json().catch(() => ({}))

  /* Le battement du serveur de collaboration : il dit « je tourne, et voici
     depuis quand ». Il passe par ici parce que sa propre base ne lui repond
     plus — c'est justement ce qu'on cherche a constater. */
  if (corps?.heartbeat === true) {
    await pool.query(
      `INSERT INTO "RealtimeHeartbeat" (id, "beatAt", "startedAt", version)
       VALUES (1, NOW(), $1, $2)
       ON CONFLICT (id) DO UPDATE SET "beatAt" = NOW(), "startedAt" = EXCLUDED."startedAt", version = EXCLUDED.version`,
      [corps.startedAt ? new Date(corps.startedAt) : null, String(corps.version || '').slice(0, 40)]
    )
    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const { name, update } = corps
  if (!/^page:\d+$/.test(String(name || ''))) return NextResponse.json({ error: 'bad_name' }, { status: 400 })
  if (typeof update !== 'string' || !update) return NextResponse.json({ error: 'bad_update' }, { status: 400 })

  const recu = Buffer.from(update, 'base64')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    /* Verrouille la ligne : deux sauvegardes simultanees fusionneraient sinon
       chacune sur la meme base de depart, et la seconde perdrait la premiere. */
    const r = await client.query('SELECT data FROM "WorkspaceDoc" WHERE name = $1 FOR UPDATE', [name])
    const doc = new Y.Doc()
    if (r.rows[0]?.data) Y.applyUpdate(doc, new Uint8Array(r.rows[0].data))
    Y.applyUpdate(doc, new Uint8Array(recu))
    const fusionne = Buffer.from(Y.encodeStateAsUpdate(doc))
    await client.query(
      `INSERT INTO "WorkspaceDoc" (name, data, "updatedAt") VALUES ($1, $2, NOW())
       ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, "updatedAt" = NOW()`,
      [name, fusionne]
    )
    await client.query('COMMIT')
    return NextResponse.json({ bytes: fusionne.length }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    await client.query('ROLLBACK')
    return NextResponse.json({ error: e instanceof Error ? e.message : 'save_failed' }, { status: 500 })
  } finally {
    client.release()
  }
}
