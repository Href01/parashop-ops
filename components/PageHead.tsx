import type { ReactNode } from 'react'

/**
 * L'EN-TÊTE DE PAGE, EN UN SEUL ENDROIT.
 *
 * Onze pages redéfinissaient chacune la leur, et elles avaient divergé : titre à
 * 26, 28 ou 30 px selon la page, fil d'Ariane présent ici et absent là, marges
 * qui ne tombaient jamais pareil. Chaque correction de densité devait donc être
 * refaite onze fois — c'est précisément ce qui rendait le BOS incohérent.
 *
 * Ce que ce composant supprime volontairement : le fil d'Ariane
 * « OPÉRATIONS · COMMANDES ». La barre du haut affiche déjà « Commandes /
 * Opérations » à trois centimètres au-dessus, et le titre le redit une troisième
 * fois. Sur mobile, cette triple redondance coûtait à elle seule plus d'un écran
 * de défilement avant la première donnée.
 *
 * Ce qu'il NE supprime PAS : les paragraphes d'explication de /prices, /leads,
 * /restock et /sendit. Ceux-là ne répètent rien — ils disent ce que la page
 * calcule et pourquoi. Ils passent par `note` et gardent leur place, en retrait.
 */
export default function PageHead({
  title,
  count,
  note,
  meta,
  actions,
}: {
  /** Le nom de la page. Rien d'autre — pas de section, pas de contexte. */
  title: string
  /** Compteur discret collé au titre : « Commandes 228 ». Remplace un sous-titre entier. */
  count?: number | string
  /** Explication courte de ce que fait la page. Absente sur les pages évidentes. */
  note?: ReactNode
  /** Contexte de droite avant les actions : période, dernière synchro… */
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="bo-page-head" style={{ marginBottom: note ? 16 : 14 }}>
      <div className="bo-page-head-row">
        {/* 19 px et 800 : la graisse porte la hiérarchie, plus la taille. Les
            titres de 30 px poussaient la donnée sous la ligne de flottaison. */}
        <h1 className="serif-display" style={{ fontSize: 19, lineHeight: 1.1, margin: 0 }}>
          {title}
        </h1>

        {count !== undefined && count !== null && (
          <span
            className="bo-num"
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: 'var(--tx-lo)',
              background: 'var(--bg-3)',
              padding: '3px 8px',
              borderRadius: 999,
            }}
          >
            {count}
          </span>
        )}

        {meta && (
          <span className="bo-page-meta">{meta}</span>
        )}

        <div style={{ flex: 1 }} />

        {actions && (
          <div className="bo-page-actions">
            {actions}
          </div>
        )}
      </div>

      {note && (
        <p
          className="bo-page-note"
          style={{
            fontSize: 12.5,
            color: 'var(--tx-lo)',
            lineHeight: 1.55,
            margin: '8px 0 0',
            maxWidth: 760,
            fontWeight: 500,
          }}
        >
          {note}
        </p>
      )}
    </div>
  )
}
