import { load } from 'cheerio'

/** Le HTML d'un article livre par l'agent (pur : teste sans base ni serveur). */

const BALISES = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'])
const SITE = /^\/(?:ar\/)?(?:categorie\/[a-z0-9-]+|marques\/[a-z0-9-]+|blog\/[a-z0-9-]+|k-beauty)\/?$/

/** HTML de l'article : balises simples, aucun attribut sauf un lien interne ; en arabe, les liens prennent /ar. */
export function nettoyerArticle(html: string, locale: 'fr' | 'ar'): string {
  const $ = load(html, null, false)
  $('script, style, iframe, img, object, embed, form, svg').remove()
  $('*').each((_, el) => {
    if (el.type !== 'tag') return
    const nom = el.tagName.toLowerCase()
    if (!BALISES.has(nom)) { $(el).replaceWith($(el).contents()); return }
    const href = nom === 'a' ? ($(el).attr('href') || '') : ''
    for (const attr of Object.keys(el.attribs || {})) $(el).removeAttr(attr)
    if (nom !== 'a') return
    let chemin = href.replace(/^https?:\/\/(www\.)?shinecosmetics\.ma/i, '')
    if (!SITE.test(chemin)) { $(el).replaceWith($(el).contents()); return }
    chemin = chemin.replace(/\/$/, '')
    if (locale === 'ar' && !chemin.startsWith('/ar/')) chemin = `/ar${chemin}`
    if (locale === 'fr') chemin = chemin.replace(/^\/ar\//, '/')
    $(el).attr('href', chemin)
  })
  return $.html()
}
