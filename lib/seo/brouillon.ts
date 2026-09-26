import 'server-only'
import { load } from 'cheerio'
import pool from '@/lib/db'
import { nettoyerArticle } from './article-html'

/**
 * UN ARTICLE ECRIT PAR L'AGENT, ENREGISTRE EN BROUILLON — JAMAIS PUBLIE.
 *
 * L'agent (routine cloud) n'a pas acces a la base : il envoie l'article au BOS,
 * qui le nettoie et l'ecrit dans "Post" avec published = false. Achraf le relit
 * dans /admin/blog de la boutique (liste de controle SEO, « J'ai relu ») et
 * decide de publier. Les memes regles que l'atelier DeepSeek de la boutique :
 * HTML simple, liens internes seulement, produits existants et actifs.
 */

export const CATEGORIES_BLOG = ['Beauté', 'Soins visage', 'Soins cheveux', 'Corps', 'Conseils', 'Tendances', 'Guides'] as const
const texteSeul = (html: string) => load(html, null, false).text().replace(/\s+/g, ' ').trim()
const champ = (v: unknown, nom: string, min: number, max: number) => {
  const s = typeof v === 'string' ? v.trim() : ''
  if (s.length < min || s.length > max) throw new Error(`${nom} : entre ${min} et ${max} caractères (reçu ${s.length}).`)
  return s
}

export type ArticleAgent = {
  title: string; slug: string; excerpt: string; content: string
  titleAr: string; excerptAr: string; contentAr: string
  category: string; metaTitle: string; metaDescription: string; focusKeyword: string; tags: string[]
}

/** Verifie l'article et l'enregistre en brouillon. L'erreur dit a l'agent quoi corriger. */
export async function enregistrerBrouillon(o: unknown): Promise<{ postId: number; slug: string; titre: string }> {
  if (!o || typeof o !== 'object') throw new Error('article requis.')
  const a = o as Record<string, unknown>
  const title = champ(a.title, 'title', 10, 200)
  const slug = champ(a.slug, 'slug', 3, 80)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('slug : minuscules ASCII et tirets seulement.')
  const content = nettoyerArticle(champ(a.content, 'content', 500, 100000), 'fr')
  const contentAr = nettoyerArticle(champ(a.contentAr, 'contentAr', 300, 100000), 'ar')
  if (texteSeul(content).split(' ').length < 400) throw new Error('content : un article de 400 mots au moins (900 à 1 500 attendus).')
  if (!texteSeul(contentAr)) throw new Error('contentAr vide : la version arabe complète est requise.')
  const category = CATEGORIES_BLOG.includes(a.category as (typeof CATEGORIES_BLOG)[number]) ? String(a.category) : 'Conseils'
  const tags = Array.isArray(a.tags) ? [...new Set(a.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 5) : []
  const ids = [...new Set([...`${content}\n${contentAr}`.matchAll(/\[produit:(\d+)\]/g)].map((m) => Number(m[1])))]
  if (ids.length) {
    const actifs = await pool.query<{ id: number }>(`SELECT id FROM "Product" WHERE active = true AND COALESCE(discontinued, false) = false AND id = ANY($1::int[])`, [ids])
    const inconnus = ids.filter((id) => !actifs.rows.some((r) => r.id === id))
    if (inconnus.length) throw new Error(`[produit:ID] inconnu ou inactif : ${inconnus.join(', ')}. N'utilise que les numéros des fiches en ligne.`)
  }
  const pris = await pool.query(`SELECT 1 FROM "Post" WHERE slug = $1`, [slug])
  if (pris.rowCount) throw new Error(`slug « ${slug} » déjà utilisé par un article : choisis-en un autre.`)
  const mots = Math.max(texteSeul(content).split(' ').length, texteSeul(contentAr).split(' ').length)
  const r = await pool.query<{ id: number }>(
    `INSERT INTO "Post" (slug, title, excerpt, content, category, published, "readTime", "metaTitle", "metaDescription", "focusKeyword", tags,
                         "titleAr", "excerptAr", "contentAr", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()) RETURNING id`,
    [slug, title, champ(a.excerpt, 'excerpt', 20, 1000), content, category, Math.max(1, Math.min(60, Math.ceil(mots / 200))),
     champ(a.metaTitle, 'metaTitle', 20, 70), champ(a.metaDescription, 'metaDescription', 80, 200), champ(a.focusKeyword, 'focusKeyword', 3, 150), tags,
     champ(a.titleAr, 'titleAr', 5, 200), champ(a.excerptAr, 'excerptAr', 10, 1000), contentAr])
  return { postId: r.rows[0].id, slug, titre: title }
}
