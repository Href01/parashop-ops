import { NextRequest, NextResponse } from 'next/server'
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

export async function GET(req: NextRequest) {
  const s = await getServerSession(authOptions)
  if (!s?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const name = req.nextUrl.searchParams.get('name') || ''
  if (!/^page:\d+$/.test(name)) return NextResponse.json({ error: 'bad_name' }, { status: 400 })

  const r = await pool.query('SELECT data FROM "WorkspaceDoc" WHERE name = $1', [name])
  const data: Buffer | undefined = r.rows[0]?.data
  return NextResponse.json(
    { state: data ? Buffer.from(data).toString('base64') : null, bytes: data ? data.length : 0 },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
