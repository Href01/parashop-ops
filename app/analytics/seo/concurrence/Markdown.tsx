import { Fragment, type ReactNode } from 'react'

/**
 * Le Markdown des rapports de l'agent, rendu en elements React — jamais en HTML
 * injecte : un rapport contient du texte copie depuis des pages concurrentes.
 * Juste ce que l'agent ecrit : titres, paragraphes, listes, tableaux, gras,
 * italique, code, liens.
 */
function inline(texte: string, cle: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g
  let dernier = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(texte))) {
    if (m.index > dernier) out.push(texte.slice(dernier, m.index))
    const t = m[0]
    const k = `${cle}-${i++}`
    if (t.startsWith('**')) out.push(<strong key={k}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) {
      const lien = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t)
      const href = lien?.[2] ?? ''
      out.push(/^https?:\/\//.test(href)
        ? <a key={k} href={href} target="_blank" rel="noopener noreferrer">{lien?.[1]}</a>
        : <span key={k}>{lien?.[1]}</span>)
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>)
    dernier = m.index + t.length
  }
  if (dernier < texte.length) out.push(texte.slice(dernier))
  return out
}

const cellules = (ligne: string) => ligne.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

export default function Markdown({ texte, className }: { texte: string; className?: string }) {
  const lignes = texte.replace(/\r/g, '').split('\n')
  const blocs: ReactNode[] = []
  let i = 0
  while (i < lignes.length) {
    const l = lignes[i]
    const k = `b${i}`
    if (!l.trim()) { i++; continue }
    const titre = /^(#{1,3})\s+(.*)$/.exec(l)
    if (titre) {
      const n = titre[1].length
      const contenu = inline(titre[2], k)
      blocs.push(n === 1 ? <h1 key={k}>{contenu}</h1> : n === 2 ? <h2 key={k}>{contenu}</h2> : <h3 key={k}>{contenu}</h3>)
      i++
      continue
    }
    if (l.trim().startsWith('|') && lignes[i + 1] && /^\s*\|?\s*:?-{2,}/.test(lignes[i + 1])) {
      const tete = cellules(l)
      const corps: string[][] = []
      i += 2
      while (i < lignes.length && lignes[i].trim().startsWith('|')) corps.push(cellules(lignes[i++]))
      blocs.push(
        <div key={k} className="mdTable" style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr>{tete.map((c, j) => <th key={j}>{inline(c, `${k}h${j}`)}</th>)}</tr></thead>
            <tbody>{corps.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `${k}r${ri}c${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>)
      continue
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordonnee = /^\s*\d+\./.test(l)
      const items: string[] = []
      while (i < lignes.length && /^\s*([-*]|\d+\.)\s+/.test(lignes[i])) {
        let item = lignes[i].replace(/^\s*([-*]|\d+\.)\s+/, '')
        i++
        // Continuation indentee d'un meme point.
        while (i < lignes.length && /^\s{2,}\S/.test(lignes[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lignes[i])) item += ' ' + lignes[i++].trim()
        items.push(item)
      }
      const lis = items.map((t, j) => <li key={j}>{inline(t, `${k}l${j}`)}</li>)
      blocs.push(ordonnee ? <ol key={k}>{lis}</ol> : <ul key={k}>{lis}</ul>)
      continue
    }
    const para: string[] = []
    while (i < lignes.length && lignes[i].trim() && !/^(#{1,3}\s|\s*\||\s*([-*]|\d+\.)\s+)/.test(lignes[i])) para.push(lignes[i++].trim())
    if (!para.length) { para.push(l.trim()); i++ }
    blocs.push(<p key={k}>{inline(para.join(' '), k)}</p>)
  }
  return <div className={className}>{blocs.map((b, j) => <Fragment key={j}>{b}</Fragment>)}</div>
}
