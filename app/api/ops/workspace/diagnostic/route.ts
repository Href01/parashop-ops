import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import pool from '@/lib/db'

/**
 * GET /api/ops/workspace/diagnostic → ce qui bloque exactement, en clair.
 *
 * POURQUOI CETTE ROUTE EXISTE. Quand l'espace collaboratif ne s'ouvre pas,
 * l'ecran disait « Serveur temps-réel non configuré » et conseillait d'ajouter
 * deux variables — alors qu'elles etaient posees depuis deux mois. Le vrai
 * defaut pouvait etre une session expiree, un serveur endormi ou deux jetons
 * devenus differents, et rien ne permettait de les distinguer.
 *
 * Surtout : `REALTIME_TOKEN` est marque « Sensitive » cote Vercel, donc
 * ILLISIBLE — ni par le tableau de bord, ni par `vercel env pull`. Personne ne
 * peut plus comparer les deux jetons a la main. Mais ce processus serveur, lui,
 * l'a dans son environnement : il est le seul endroit d'ou la verification est
 * possible. C'est toute la raison d'etre de cette route.
 *
 * ELLE NE DIVULGUE AUCUNE VALEUR : ni jeton, ni fragment de jeton. Seulement sa
 * longueur et une empreinte courte, de quoi comparer avec Render sans jamais
 * exposer le secret.
 */
export const dynamic = 'force-dynamic'

type Etape = { etape: string; ok: boolean; detail: string }

/** Empreinte courte et NON reversible, juste de quoi comparer deux cotes. */
async function empreinte(valeur: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(valeur))
  return Array.from(new Uint8Array(buf)).slice(0, 4).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function GET() {
  const s = await getServerSession(authOptions)
  if (!s?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const etapes: Etape[] = []
  const url = process.env.NEXT_PUBLIC_REALTIME_URL || ''
  const token = process.env.REALTIME_TOKEN || ''

  etapes.push({
    etape: 'Session BOS',
    ok: true,
    detail: `connecte en tant que ${s.user.email}`,
  })

  etapes.push({
    etape: 'Variable NEXT_PUBLIC_REALTIME_URL',
    ok: !!url,
    detail: url ? `definie : ${url}` : 'VIDE — a poser dans Vercel (projet ops, Production)',
  })

  etapes.push({
    etape: 'Variable REALTIME_TOKEN',
    ok: !!token,
    detail: token
      ? `definie : ${token.length} caracteres, empreinte ${await empreinte(token)}`
      : 'VIDE — a poser dans Vercel (projet ops, Production)',
  })

  /* Le serveur repond-il ? Hocuspocus sert `GET /` → « OK » pour la sonde de
     Render. Un service endormi renvoie une page d'attente, pas « OK ». */
  if (url) {
    const httpUrl = url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://')
    try {
      const r = await fetch(httpUrl, { cache: 'no-store', signal: AbortSignal.timeout(25_000) })
      const corps = (await r.text()).slice(0, 40)
      const eveille = r.ok && corps.trim().startsWith('OK')
      etapes.push({
        etape: 'Serveur temps-reel joignable',
        ok: eveille,
        detail: eveille
          ? `${httpUrl} repond OK`
          : `${httpUrl} repond ${r.status} — service endormi ou en cours de reveil, reessaie dans une minute`,
      })
    } catch (e) {
      etapes.push({
        etape: 'Serveur temps-reel joignable',
        ok: false,
        detail: `${httpUrl} injoignable (${e instanceof Error ? e.message : 'erreur reseau'})`,
      })
    }
  }

  /* LE TEST QUI TRANCHE. On presente le jeton de Vercel au serveur de Render.
     Lui seul sait s'ils correspondent encore, et c'est la seule facon de le
     savoir sans pouvoir lire aucun des deux. */
  if (url && token) {
    etapes.push(await verifieJeton(url, token))
  }

  /* Le contenu, lui, ne depend d'aucun de ces reglages : il est en Postgres. */
  try {
    const d = await pool.query(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(octet_length(data)), 0)::int AS octets FROM "WorkspaceDoc"`
    )
    const { n, octets } = d.rows[0]
    etapes.push({
      etape: 'Contenu des pages',
      ok: true,
      detail: `${n} document(s), ${Math.round(octets / 1024)} Ko en base — intact, independant de la connexion`,
    })
  } catch {
    etapes.push({ etape: 'Contenu des pages', ok: false, detail: 'lecture de WorkspaceDoc impossible' })
  }

  const bloquant = etapes.find((e) => !e.ok)
  return NextResponse.json(
    { ok: !bloquant, cause: bloquant?.etape ?? null, conseil: bloquant ? CONSEILS[bloquant.etape] ?? null : null, etapes },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

const CONSEILS: Record<string, string> = {
  'Variable NEXT_PUBLIC_REALTIME_URL':
    'Vercel → projet ops → Settings → Environment Variables → ajoute NEXT_PUBLIC_REALTIME_URL = wss://shine-realtime.onrender.com pour Production, puis redeploie.',
  'Variable REALTIME_TOKEN':
    'Vercel → projet ops → Settings → Environment Variables → ajoute REALTIME_TOKEN (la meme valeur que sur Render), puis redeploie.',
  'Serveur temps-reel joignable':
    "Le service Render dort ou est arrete. Ouvre son tableau de bord ; s'il est en veille, une visite le reveille en ~50 s. Verifie aussi que le pinger cron-job.org tourne toutes les 5 min.",
  'Jeton accepte par le serveur':
    "Les deux REALTIME_TOKEN ne correspondent plus. Celui de Vercel est illisible (Sensitive) : lis celui de Render (Environment du service, il affiche ses valeurs), puis REMPLACE celui de Vercel par cette valeur et redeploie ops. Compare les empreintes pour confirmer avant de redeployer.",
}

/** Ouvre une vraie connexion Hocuspocus et regarde si l'authentification passe. */
async function verifieJeton(url: string, token: string): Promise<Etape> {
  const wsUrl = url.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
  try {
    const { HocuspocusProvider } = await import('@hocuspocus/provider')
    const Y = await import('yjs')
    return await new Promise<Etape>((resolve) => {
      let fini = false
      const finir = (ok: boolean, detail: string) => {
        if (fini) return
        fini = true
        try { fournisseur.destroy() } catch { /* deja ferme */ }
        resolve({ etape: 'Jeton accepte par le serveur', ok, detail })
      }
      /* Un nom de document reserve au diagnostic : l'authentification est
         verifiee AVANT tout chargement, donc un echec n'ecrit rien. */
      const fournisseur = new HocuspocusProvider({
        url: wsUrl,
        name: '__diagnostic__',
        token,
        document: new Y.Doc(),
        preserveConnection: false,
        onAuthenticated: () => finir(true, 'le serveur Render accepte ce jeton — la connexion est bonne'),
        onAuthenticationFailed: ({ reason }) =>
          finir(false, `REFUSE par le serveur (${reason}) — le jeton de Vercel differe de celui de Render`),
      })
      setTimeout(() => finir(false, 'aucune reponse du serveur en 25 s — service endormi ou injoignable'), 25_000)
    })
  } catch (e) {
    return {
      etape: 'Jeton accepte par le serveur',
      ok: false,
      detail: `test impossible (${e instanceof Error ? e.message : 'erreur'})`,
    }
  }
}
