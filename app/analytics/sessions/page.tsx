'use client'

/**
 * SESSIONS — qui est là, et ce que chacune a fait.
 *
 * L'équivalent première main du « User Look-Up » d'Amplitude et de la liste
 * d'enregistrements de Hotjar. On ne rejoue pas une vidéo : on rejoue la SUITE
 * DES ACTIONS, ce qui répond à la même question pour l'essentiel — qu'a-t-elle
 * fait, dans quel ordre, et où s'est-elle arrêtée.
 *
 * Le choix est assumé : une relecture vidéo imposerait un script tiers de ~40 ko
 * sur la vitrine, sur 87 % de trafic mobile marocain, alors qu'on vient d'en
 * retirer un qui ne fonctionnait plus. Ici, zéro kilo-octet, et la session est
 * rattachée à SA COMMANDE — ce qu'aucun outil externe ne sait faire, puisque le
 * dénouement (livrée ou refusée) n'existe que dans notre base.
 */

import { useCallback, useEffect, useState } from 'react'
import { V } from '../_components/Viz'
import { T } from '../_components/Decision'
import { ReportShell, Scorecard, Squelette, ErreurChargement, Ecart, fmt } from '../_components/Report'
import { BarreControle } from '../_components/Controls'
import { useReport } from '../_components/useReport'
import { Chronologie, LegendeFamilles, BRUIT, type Evenement } from '../_components/Chronologie'
import { Emplacements } from '../_components/Emplacements'

type Session = {
  sessionId: string; device: string; ville: string; source: string
  visiteur: string | null; debut: string; derniere: string
  actions: number; fiches: number; paniers: number; recherches: number; frictions: number
  duree: number; enLigne: boolean
  automatise: boolean; pays: string | null; medium: string | null; campagne: string | null; arrivee: string | null
  commande: { id: number; nom: string | null; telephone: string | null; statut: string; montant: number } | null
}
type Segment = { cle: string; label: string }
type Dim = { cle: string; n: number }
type Reponse = {
  direct: { actifs: number; evenements: number; automatises: number }
  inclureAuto: boolean
  sessions: Session[]
  repartition: Record<string, number>
  repartitionPrecedente: Record<string, number> | null
  segments: Segment[]
  appareils: Dim[]
  canaux: Dim[]
}

const duree = (s: number) => (s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1).replace('.', ',')} h`)
const heure = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Africa/Casablanca' }).format(new Date(iso))

export default function Sessions() {
  const { etat, maj, setJours, setPeriode, setFiltre: setFiltreDim, periodePersonnalisee } = useReport()
  const [filtre, setFiltre] = useState('toutes')
  const [q, setQ] = useState('')
  const [qDifferee, setQDifferee] = useState('')
  const [appareil, setAppareil] = useState('')
  const [canal, setCanal] = useState('')
  // Les sessions automatisees (robots, rendus Meta/Google, hebergeurs) sont ecartees par defaut.
  const [auto, setAuto] = useState(false)
  const [data, setData] = useState<Reponse | null>(null)
  const [ouverte, setOuverte] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<Evenement[] | null>(null)
  const [tout, setTout] = useState(false)
  const [erreurTimeline, setErreurTimeline] = useState<string | null>(null)
  const [timelineTronquee, setTimelineTronquee] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(() => {
    // On envoie les bornes de comparaison AFFICHÉES plutôt que de laisser le
    // serveur les recalculer : deux calculs séparés finissent par diverger, et
    // le libellé mentirait alors sur ce qui a réellement été comparé.
    const p = new URLSearchParams({
      debut: etat.periode.debut, fin: etat.periode.fin,
      cmp: etat.comparaison ? '1' : '0',
      cmpDebut: etat.comparaison?.debut ?? '', cmpFin: etat.comparaison?.fin ?? '',
      filtre, q: qDifferee, appareil, canal, auto: auto ? '1' : '0',
    })
    fetch(`/api/ops/analytics/sessions?${p}`).then((r) => r.json())
      .then((j) => { if (j.error) setErreur(j.error); else { setData(j); setErreur(null) } })
      .catch((e) => setErreur(String(e)))
  }, [etat.periode.debut, etat.periode.fin, etat.comparaison, filtre, qDifferee, appareil, canal, auto])

  useEffect(() => {
    const t = setTimeout(() => setQDifferee(q), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => { charger() }, [charger])
  // Le direct se rafraîchit tout seul : c'est la seule vue où l'attente a un sens.
  // Mais seulement quand elle est LUE : un onglet oublié en arrière-plan relançait
  // cinq requêtes par minute et gardait la base éveillée (facturée à l'heure).
  // La période doit aussi contenir aujourd'hui — un mois clos ne bouge plus.
  useEffect(() => {
    const aujourdhui = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date())
    const vivant = etat.periode.fin >= aujourdhui
    const visible = () => document.visibilityState === 'visible'
    const t = vivant ? setInterval(() => { if (visible()) charger() }, 60_000) : undefined
    const retour = () => { if (vivant && visible()) charger() }
    document.addEventListener('visibilitychange', retour)
    return () => { if (t) clearInterval(t); document.removeEventListener('visibilitychange', retour) }
  }, [charger, etat.periode.fin])

  useEffect(() => {
    if (!ouverte) { setTimeline(null); setErreurTimeline(null); setTimelineTronquee(false); return }
    let vivant = true
    setTimeline(null)
    setErreurTimeline(null)
    // Le paramètre s'appelle `id`, pas `sessionId` : la première version
    // envoyait le mauvais nom, l'API répondait 400, et l'erreur était AVALÉE —
    // le squelette restait affiché indéfiniment, sans un mot. Un échec muet est
    // pire qu'un message d'erreur : on ne sait même pas qu'il y a un problème.
    fetch(`/api/ops/analytics/session?id=${encodeURIComponent(ouverte)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({ error: `Réponse illisible (${r.status})` }))
        if (!vivant) return
        if (!r.ok || j.error) { setErreurTimeline(j.error || `Erreur ${r.status}`); setTimeline([]) }
        else { setTimeline(j.timeline ?? []); setTimelineTronquee(j.truncated === true) }
      })
      .catch((e) => {
        if (!vivant) return
        setErreurTimeline(e instanceof Error ? e.message : 'Chargement impossible')
        setTimeline([])
      })
    return () => { vivant = false }
  }, [ouverte])

  /* Le taux, calculé ici plutôt qu'en base : les deux nombres sont déjà dans la
     réponse, et un aller-retour de plus ne dirait rien de neuf. `null` quand il
     n'y a aucune session — un taux sur zéro n'existe pas, et afficher « 0 % »
     laisserait croire à un effondrement là où il n'y a simplement rien. */
  const taux = (n?: number, d?: number) => (d && d > 0 ? ((n ?? 0) / d) * 100 : null)
  const tauxConversion = taux(data?.repartition?.achat, data?.repartition?.toutes)
  const tauxConversionPrecedent = taux(
    data?.repartitionPrecedente?.achat, data?.repartitionPrecedente?.toutes
  ) ?? undefined
  // Quelques commandes ne font pas une tendance : 2 → 3 s'affichait « ▲ 104 % ».
  // En dessous de 20 commandes (l'une ou l'autre période) on montre les valeurs, pas la flèche.
  const peuDeCommandes = Math.max(data?.repartition?.achat ?? 0, data?.repartitionPrecedente?.achat ?? 0) < 20
  const nAuto = data?.repartition?.automatise ?? 0

  return (
    <ReportShell
      colonnes={5}
      titre="Sessions"
      sous="Qui est là maintenant, et ce que chaque visiteuse a fait — action par action."
      controles={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Le contrôle de période COMMUN à tous les modules : hier, le mois
              dernier, des dates précises, et la comparaison. Sessions avait sa
              propre fenêtre glissante — on ne pouvait donc voir ni hier, ni un
              mois clos, ni comparer quoi que ce soit. */}
          <div className="w-full">
            <BarreControle etat={etat} maj={maj} setJours={setJours} setPeriode={setPeriode}
              setFiltre={setFiltreDim} periodePersonnalisee={periodePersonnalisee} afficherBase={false} />
          </div>

          {/* Les segments PORTENT LEUR EFFECTIF. Une puce muette oblige à
              cliquer pour savoir si elle contient trois sessions ou trois
              cents ; avec le compte, on compare les segments entre eux d'un
              seul regard, sans changer de vue. */}
          <div className="flex flex-nowrap sm:flex-wrap items-center gap-1 overflow-x-auto sm:overflow-visible w-full pb-1">
            {(data?.segments ?? []).map((f) => {
              const n = data?.repartition?.[f.cle] ?? 0
              const prec = data?.repartitionPrecedente?.[f.cle]
              const on = filtre === f.cle
              const vide = n === 0 && f.cle !== 'toutes'
              // « Ont buté » qui monte est une mauvaise nouvelle, « Ont
              // commandé » qui monte une bonne : le sens de la flèche dépend du
              // segment, il ne peut pas être uniforme.
              const hausseBonne = !['friction', 'panier_sans_achat', 'sans_action'].includes(f.cle)
              return (
                <button key={f.cle} onClick={() => setFiltre(f.cle)} disabled={vide}
                  className="ctrl rounded-lg px-2.5 py-1 text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-35 shrink-0 whitespace-nowrap"
                  style={{ border: `1px solid ${on ? V.ink : V.grid}` }}
                  data-on={on ? '1' : undefined}
                  title={vide ? 'Aucune session dans ce segment sur cette période'
                    : prec != null ? `${n} sur la période · ${prec} sur la précédente` : undefined}>
                  {f.label}
                  <span className="tabular-nums text-[11px]" style={{ opacity: on ? 0.75 : 0.55 }}>{n}</span>
                  {prec != null && !on && Math.max(n, prec) >= 20 && <Ecart courant={n} precedent={prec} hausseEstBonne={hausseBonne} />}
                </button>
              )
            })}
          </div>

          <select value={appareil} onChange={(e) => setAppareil(e.target.value)}
            className="text-[12px] font-semibold rounded-lg px-2 py-1 outline-none"
            style={{ border: `1px solid ${V.grid}`, color: V.ink, background: '#fff' }}>
            <option value="">Tous les appareils</option>
            {(data?.appareils ?? []).map((a) => (
              <option key={a.cle} value={a.cle}>{a.cle} ({a.n})</option>
            ))}
          </select>

          <select value={canal} onChange={(e) => setCanal(e.target.value)}
            className="text-[12px] font-semibold rounded-lg px-2 py-1 outline-none"
            style={{ border: `1px solid ${V.grid}`, color: V.ink, background: '#fff' }}>
            <option value="">Tous les canaux</option>
            {(data?.canaux ?? []).map((c) => (
              <option key={c.cle} value={c.cle}>{c.cle} ({c.n})</option>
            ))}
          </select>

          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ville, source, nom, téléphone…"
            className="text-[12px] rounded-lg px-2 py-1 outline-none min-w-[190px]"
            style={{ border: `1px solid ${V.grid}`, color: V.ink }} />

          <label className="inline-flex items-center gap-1.5 text-[12px] font-semibold cursor-pointer" style={{ color: V.ink2 }}
            title="Robots de relecture des annonces (Google, Meta), rendus de pages et visites depuis des hébergeurs : écartés par défaut. Une session avec panier ou commande n'est jamais écartée.">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Inclure le trafic automatisé <span className="tabular-nums text-[11px]" style={{ opacity: 0.6 }}>{nAuto}</span>
          </label>

          {(filtre !== 'toutes' || appareil || canal || q) && (
            <button onClick={() => { setFiltre('toutes'); setAppareil(''); setCanal(''); setQ('') }}
              className="text-[11px] font-semibold underline" style={{ color: V.muted }}>
              tout effacer
            </button>
          )}
          <style>{`
            .ctrl { background: transparent; color: ${V.ink2}; transition: background-color .14s ease, color .14s ease }
            .ctrl:hover { background: ${V.grid}66; color: ${V.ink} }
            .ctrl[data-on] { background: ${V.ink}; color: #fff }
            .pulse { animation: pl 2s ease-in-out infinite }
            @keyframes pl { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
            @media (prefers-reduced-motion: reduce) { .pulse { animation: none } }
          `}</style>
        </div>
      }
      enTete={erreur ? <ErreurChargement message={erreur} /> : null}
      scorecards={!data ? ([0, 1, 2, 3].map((i) => <div key={i}><Squelette lignes={2} hauteur={12} /></div>)) : (
        <>
          <div className="min-w-0">
            <p className={T.label} style={{ color: V.muted }}>
              <span className="pulse inline-block w-1.5 h-1.5 rounded-full me-1.5" style={{ background: V.good }} />
              En ce moment
            </p>
            <p className="text-[22px] font-black leading-none tabular-nums mt-1" style={{ color: V.ink }}>
              {data.direct.actifs}
            </p>
            <p className={T.note} style={{ color: V.muted }}>
              visiteuses actives, 30 dernières minutes
              {!auto && data.direct.automatises > 0 ? ` · ${data.direct.automatises} robot${data.direct.automatises > 1 ? 's' : ''} écarté${data.direct.automatises > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          {/* Ces trois nombres viennent de la RÉPARTITION calculée en base, pas
              d'un comptage sur les lignes affichées : la liste est plafonnée à
              60 et déjà filtrée, donc compter dessus donnait un total faux dès
              qu'un segment était actif. */}
          <Scorecard label="Sessions" portee="sessions"
            definition="Sessions du site ouvertes sur la période, avant filtrage par segment. Le trafic automatisé (robots de relecture des annonces, rendus Meta et Google, hébergeurs) est écarté tant que la case n'est pas cochée ; une session avec panier ou commande n'est jamais écartée."
            valeur={data.repartition?.toutes ?? data.sessions.length}
            precedent={data.repartitionPrecedente?.toutes} format="entier" hausseEstBonne
            note={[
              data.sessions.length < (data.repartition?.[filtre] ?? 0) ? `${data.sessions.length} affichées sur ${data.repartition?.[filtre]}` : '',
              !auto && nAuto > 0 ? `${nAuto} automatisées écartées` : '',
            ].filter(Boolean).join(' · ') || undefined} />
          {/* LE TAUX DE CONVERSION — la mesure qui manquait.
              Sessions ayant abouti à une commande ÷ sessions totales. Le
              dénominateur et le numérateur viennent tous deux de la répartition
              calculée en base, donc ils bougent ensemble quand un filtre est
              actif : un taux qui mélangerait un numérateur filtré et un total
              global serait faux sans prévenir.
              À noter : seules les commandes DU SITE comptent (elles portent un
              `sessionId`). Les commandes prises à la main sur Instagram ou
              WhatsApp n'ont pas de session — les compter ici gonflerait un taux
              censé mesurer la vitrine. */}
          <Scorecard label="Taux de conversion" portee="sessions"
            definition="Part des sessions qui se terminent par une commande passée sur le site. Les commandes prises à la main (Instagram, WhatsApp) n'ont pas de session et n'entrent pas dans ce calcul."
            valeur={tauxConversion} precedent={peuDeCommandes ? undefined : tauxConversionPrecedent}
            format="pourcent" hausseEstBonne
            note={data.repartition
              ? [
                  `${fmt(data.repartition.achat ?? 0, 'entier')} commandes${(data.repartition.achat_annulees ?? 0) > 0 ? ` (dont ${data.repartition.achat_annulees} annulée${data.repartition.achat_annulees > 1 ? 's' : ''})` : ''} sur ${fmt(data.repartition.toutes ?? 0, 'entier')} sessions`,
                  peuDeCommandes && tauxConversionPrecedent != null
                    ? `précédente : ${fmt(data.repartitionPrecedente?.achat ?? 0, 'entier')}/${fmt(data.repartitionPrecedente?.toutes ?? 0, 'entier')} (${tauxConversionPrecedent.toFixed(1).replace('.', ',')} %) — trop peu de commandes pour parler de tendance`
                    : '',
                ].filter(Boolean).join(' · ')
              : undefined} />
          <Scorecard label="Panier sans commande" portee="sessions"
            definition="Elles ont mis un produit au panier et n'ont pas commandé. C'est la population la plus chère du site : l'intention est prouvée, seule la fin manque."
            valeur={data.repartition?.panier_sans_achat ?? 0}
            precedent={data.repartitionPrecedente?.panier_sans_achat} format="entier" hausseEstBonne={false} />
          <Scorecard label="Signaux de friction" portee="sessions"
            definition="Sessions avec une erreur observée ou un signal à vérifier, comme des clics répétés ou une réponse non détectée. Ne prouve pas la cause du départ."
            valeur={data.repartition?.friction ?? 0}
            precedent={data.repartitionPrecedente?.friction} format="entier" hausseEstBonne={false} />
        </>
      )}
      figure={!data ? <Squelette lignes={8} hauteur={18} /> : (
        <div>
        <Emplacements debut={etat.periode.debut} fin={etat.periode.fin} auto={auto} />
        <div className="space-y-1">
          {data.sessions.length === 0 && (
            <p className={T.note} style={{ color: V.muted }}>Aucune session sur cette période avec ces filtres.</p>
          )}
          {data.sessions.map((s) => {
            const ouvert = ouverte === s.sessionId
            return (
              <div key={s.sessionId} className="rounded-lg" style={{ border: `1px solid ${ouvert ? V.axis : V.grid}` }}>
                <button onClick={() => setOuverte(ouvert ? null : s.sessionId)}
                  className="w-full text-left px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {s.enLigne && <span className="pulse w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: V.good }} title="Active à l'instant" />}
                  <span className="text-[12px] font-semibold" style={{ color: V.ink }}>
                    {s.commande?.nom || s.ville}
                  </span>
                  <span className={T.note} style={{ color: V.muted }}>
                    {s.device} · {s.source}{s.medium ? `/${s.medium}` : ''} · {heure(s.derniere)} · {duree(s.duree)}
                  </span>
                  {s.automatise && (
                    <span className="text-[10px] font-bold rounded px-1.5 py-0.5" style={{ background: `${V.grid}`, color: V.ink2 }}
                      title="Robot ou rendu automatisé (hébergeur, relecture d'annonce) : écarté par défaut des statistiques.">automatisé</span>
                  )}
                  {s.campagne && <span className={T.note} style={{ color: V.muted }} title={`Campagne : ${s.campagne}`}>campagne {s.campagne.length > 22 ? `${s.campagne.slice(0, 22)}…` : s.campagne}</span>}
                  {s.arrivee && s.arrivee !== '/' && <span className={T.note} style={{ color: V.muted }} title={`Page d'arrivée : ${s.arrivee}`}>↳ {s.arrivee.length > 30 ? `…${s.arrivee.slice(-30)}` : s.arrivee}</span>}
                  <span className="flex-1" />
                  <span className={T.note} style={{ color: V.ink2 }}>
                    {s.actions} actions · {s.fiches} fiches · {s.paniers} panier{s.paniers > 1 ? 's' : ''}
                  </span>
                  {s.frictions > 0 && (
                    <span className="text-[11px] font-bold" style={{ color: '#854D0E' }} title="Erreurs ou signaux à vérifier, pas un nombre de pannes confirmées">▲ {s.frictions}</span>
                  )}
                  {s.commande && (
                    <span className="text-[11px] font-bold" style={{ color: s.commande.statut === 'CANCELLED' ? V.critical : V.good }}>
                      {s.commande.statut === 'DELIVERED' ? '✓ livrée' : s.commande.statut === 'CANCELLED' ? '✕ annulée' : '● commandée'}
                      {' '}{Math.round(s.commande.montant).toLocaleString('fr-FR')} MAD
                    </span>
                  )}
                  <span className="text-[10px]" style={{ color: V.muted }} aria-hidden="true">{ouvert ? '▾' : '▸'}</span>
                </button>

                {ouvert && (
                  <div className="px-3 pb-3">
                    {timeline && timeline.length > 0 && (
                      <div className="flex items-center gap-2 pb-2">
                        <button onClick={() => setTout((t) => !t)}
                          className="text-[11px] font-semibold underline" style={{ color: V.muted }}>
                          {tout ? 'ne montrer que les actions marquantes' : 'tout afficher, y compris le bruit'}
                        </button>
                        <span className={T.note} style={{ color: V.muted }}>
                          {tout
                            ? `${timeline.length} actions`
                            : `${timeline.filter((e) => !BRUIT.has(e.name)).length} actions marquantes sur ${timeline.length}`}
                        </span>
                        {timelineTronquee && (
                          <span className={T.note} style={{ color: V.warning }}>300 premières actions</span>
                        )}
                        <span className="flex-1" />
                        <LegendeFamilles />
                      </div>
                    )}
                    {erreurTimeline ? (
                      <p className={T.note} style={{ color: V.critical }}>
                        Impossible de charger la chronologie : {erreurTimeline}
                      </p>
                    ) : !timeline ? <Squelette lignes={4} hauteur={12} /> : timeline.length === 0 ? (
                      <p className={T.note} style={{ color: V.muted }}>Aucune action enregistrée.</p>
                    ) : (
                      <Chronologie evenements={timeline.filter((e) => tout || !BRUIT.has(e.name))} />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        </div>
      )}
    />
  )
}
