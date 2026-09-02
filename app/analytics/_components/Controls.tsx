'use client'

/**
 * LA BARRE DE CONTROLE, commune a tous les modules.
 *
 * Periode, comparaison, base de lecture, segments. Identique partout — on
 * apprend a piloter une fois. Tout part dans l'URL (cf. `useReport`), donc une
 * vue reglee se partage par lien.
 *
 * La BASE n'est pas un detail technique : sur 30 jours, la meme periode vaut
 * 19 337 MAD datee a la commande et 21 431 MAD datee a la livraison. Les deux
 * sont justes, elles ne repondent pas a la meme question.
 *
 * Sur le mouvement : chaque etat a une transition courte (120-160 ms) et rien
 * ne bouge tout seul. Une animation sert a rendre un changement lisible — pas a
 * decorer. Un tableau de bord qui remue en permanence fatigue en trois jours.
 */

import { useState } from 'react'
import { V } from './Viz'
import { T } from './Decision'
import { PERIODES, PERIODES_DECALEES, periodeDecaleeActive, dateDuJour, type EtatRapport } from './useReport'

function Groupe({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex rounded-lg overflow-hidden" style={{ border: `1px solid ${V.grid}` }}>
      {children}
    </div>
  )
}

function Bouton({ actif, onClick, children, titre }: {
  actif: boolean; onClick: () => void; children: React.ReactNode; titre?: string
}) {
  return (
    <button
      onClick={onClick}
      title={titre}
      aria-pressed={actif}
      className="px-2.5 py-1 text-[12px] font-semibold whitespace-nowrap ctrl"
      data-on={actif ? '1' : undefined}
    >
      {children}
    </button>
  )
}

export function BarreControle({
  etat, maj, setJours, setPeriode, setFiltre, periodePersonnalisee, segments,
  afficherComparaison = true, afficherBase = true,
}: {
  etat: EtatRapport
  maj: (p: Record<string, string | null>) => void
  setJours: (j: number) => void
  setPeriode?: (debut: string, fin: string) => void
  setFiltre: (d: string, v: string[]) => void
  periodePersonnalisee?: boolean
  segments?: { appareil?: string[]; langue?: string[] }
  afficherComparaison?: boolean
  afficherBase?: boolean
}) {
  const [ouvert, setOuvert] = useState(false)
  const [d1, setD1] = useState(etat.periode.debut)
  const [d2, setD2] = useState(etat.periode.fin)
  const valeurFiltre = (dim: string) => etat.filtres.find((f) => f.dimension === dim)?.valeurs ?? []
  const actifs = etat.filtres.length
  const jour = dateDuJour()
  const enCours = etat.jours === 1 && etat.periode.fin === jour
  const decalee = periodeDecaleeActive(etat)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {/* Styles locaux : les transitions vivent ici plutot que dupliquees sur
          chaque bouton, et le focus reste visible au clavier. */}
      <style>{`
        .ctrl { min-height: 36px; background: transparent; color: ${V.ink2};
                transition: background-color .14s ease, color .14s ease; }
        .ctrl:hover { background: ${V.grid}66; color: ${V.ink}; }
        .ctrl[data-on] { background: ${V.ink}; color: #fff; }
        .ctrl[data-on]:hover { background: ${V.ink}; }
        .ctrl:focus-visible { outline: 2px solid ${V.s1}; outline-offset: -2px; }
        .pop { animation: pop .16s cubic-bezier(.2,.8,.3,1); transform-origin: top left; }
        @keyframes pop { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) {
          .ctrl, .pop { transition: none; animation: none; }
        }
      `}</style>

      <div className="relative min-w-0 max-w-full">
        <div className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Groupe>
          {PERIODES.map((p) => (
            <Bouton
              key={p.jours}
              actif={!periodePersonnalisee && !decalee && etat.jours === p.jours}
              onClick={() => { setJours(p.jours); setOuvert(false) }}
            >
              {p.label}
            </Bouton>
          ))}
          {/* Périodes CLOSES. « Hier » se compare honnêtement à avant-hier ;
              « Aujourd'hui » compare une journée en cours à une journée
              complète, ce que l'interface doit signaler. */}
          {PERIODES_DECALEES.map((p) => (
            <Bouton
              key={p.cle}
              actif={decalee === p.cle}
              onClick={() => { const r = p.calc(); setPeriode?.(r.debut, r.fin); setOuvert(false) }}
              titre="Période terminée : la comparaison porte sur une période de même nature."
            >
              {p.label}
            </Bouton>
          ))}
          <Bouton actif={!!periodePersonnalisee && !decalee} onClick={() => {
            setD1(etat.periode.debut)
            setD2(etat.periode.fin)
            setOuvert((o) => !o)
          }}
            titre="Choisir des dates précises.">
            Dates…
          </Bouton>
          </Groupe>
        </div>

        {ouvert && (
          <div className="pop fixed inset-x-4 top-24 z-50 rounded-lg bg-white p-3 shadow-lg sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-1 sm:w-max"
            style={{ border: `1px solid ${V.grid}` }}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end">
              <label className="text-[11px] font-semibold sm:contents">
                <span className="sm:sr-only">Date de début</span>
                <input aria-label="Date de début" type="date" value={d1} max={d2 || jour} onChange={(e) => setD1(e.target.value)}
                  className="min-h-10 w-full rounded px-2 text-[12px] outline-none" style={{ border: `1px solid ${V.grid}` }} />
              </label>
              <span className="hidden text-[12px] sm:block" style={{ color: V.muted }}>→</span>
              <label className="text-[11px] font-semibold sm:contents">
                <span className="sm:sr-only">Date de fin</span>
                <input aria-label="Date de fin" type="date" value={d2} min={d1} max={jour} onChange={(e) => setD2(e.target.value)}
                  className="min-h-10 w-full rounded px-2 text-[12px] outline-none" style={{ border: `1px solid ${V.grid}` }} />
              </label>
              <button
                onClick={() => { setPeriode?.(d1, d2); setOuvert(false) }}
                disabled={!d1 || !d2 || d1 > d2 || d2 > jour}
                className="min-h-10 rounded px-3 text-[12px] font-semibold disabled:opacity-40"
                style={{ background: V.ink, color: '#fff' }}
              >
                Appliquer
              </button>
            </div>
          </div>
        )}
      </div>

      {afficherComparaison && (
        <Groupe>
          <Bouton actif={etat.modeComparaison === 'precedente'} onClick={() => maj({ cmp: null })}
            titre="Compare à la période immédiatement précédente, de même durée.">
            vs précédente
          </Bouton>
          <Bouton actif={etat.modeComparaison === 'aucune'} onClick={() => maj({ cmp: '0' })} titre="Aucune comparaison.">
            sans
          </Bouton>
        </Groupe>
      )}

      {afficherBase && (
        <Groupe>
          <Bouton actif={etat.basis === 'cohorte'} onClick={() => maj({ basis: null })}
            titre="Daté au jour de la COMMANDE — pour juger ce que la publicité a produit.">
            à la commande
          </Bouton>
          <Bouton actif={etat.basis === 'cash'} onClick={() => maj({ basis: 'cash' })}
            titre="Daté au jour de la LIVRAISON — ventes réalisées, distinctes de l'encaissement.">
            à la livraison
          </Bouton>
        </Groupe>
      )}

      {segments?.appareil && segments.appareil.length > 1 && (
        <div className="flex items-center gap-1.5">
          <span className={T.note} style={{ color: V.muted }}>Appareil</span>
          <Groupe>
            <Bouton actif={valeurFiltre('appareil').length === 0} onClick={() => setFiltre('appareil', [])}>tout</Bouton>
            {segments.appareil.map((a) => (
              <Bouton key={a} actif={valeurFiltre('appareil').includes(a)} onClick={() => setFiltre('appareil', [a])}>
                {a === 'mobile' ? 'Mobile' : a === 'desktop' ? 'Ordinateur' : a}
              </Bouton>
            ))}
          </Groupe>
        </div>
      )}

      {segments?.langue && segments.langue.length > 1 && (
        <div className="flex items-center gap-1.5">
          <span className={T.note} style={{ color: V.muted }}>Langue</span>
          <Groupe>
            <Bouton actif={valeurFiltre('langue').length === 0} onClick={() => setFiltre('langue', [])}>tout</Bouton>
            {segments.langue.map((l) => (
              <Bouton key={l} actif={valeurFiltre('langue').includes(l)} onClick={() => setFiltre('langue', [l])}>
                {l === 'fr' ? 'Français' : l === 'ar' ? 'العربية' : l}
              </Bouton>
            ))}
          </Groupe>
        </div>
      )}

      {actifs > 0 && (
        <button
          onClick={() => maj(Object.fromEntries(etat.filtres.map((f) => [f.dimension, null])))}
          className="min-h-9 text-[11px] font-semibold underline" style={{ color: V.muted }}
        >
          tout réafficher
        </button>
      )}

      {/* Toujours sur sa propre ligne : le sélecteur de dates s'ouvre
          juste au-dessus et la recouvrait. */}
      <span className={`${T.note} w-full`} style={{ color: V.muted }}>
        {etat.periode.debut === etat.periode.fin ? etat.periode.debut : `${etat.periode.debut} → ${etat.periode.fin}`}
        {afficherComparaison && etat.comparaison && ` · comparé à ${etat.comparaison.debut === etat.comparaison.fin ? etat.comparaison.fin : `${etat.comparaison.debut} → ${etat.comparaison.fin}`}`}
        {/* Une journee en cours face a une journee complete : sans cette mention,
            chaque matin ressemble a un effondrement. */}
        {afficherComparaison && enCours && etat.comparaison && (
          <span style={{ color: V.warning }}> · journée en cours, comparée à une journée complète</span>
        )}
      </span>
    </div>
  )
}
