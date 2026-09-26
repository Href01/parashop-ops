'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  ExternalLink,
  Info,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { SeoDashboard as Data } from '@/lib/seo/store'
import { reportCsv, type Comparison, type Metrics } from '@/lib/seo/model'
import { mergeFilterSearch, type FilterChange } from '@/lib/seo/filter-url'
import styles from './seo.module.css'
import { SEO_RELEASES, releaseObservationDays } from '@/lib/seo/releases'

const number = (n: number | null | undefined, digits = 0) =>
  n == null ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: digits })
const percent = (n: number | null | undefined) =>
  n == null ? '—' : `${number(n * 100, 1)} %`
const day = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
const datetime = (value: string) =>
  new Date(value).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
const signalNames = {
  drop: 'À examiner',
  unobserved: 'Non observé',
  opportunity: 'Potentiel CTR',
  'low-volume': 'Faible volume',
  stable: 'Sans signal',
}
const runNames: Record<string, string> = {
  succeeded: 'Terminé',
  backfilling: 'Historique en cours',
  partial: 'Partiel',
  failed: 'Échec',
  running: 'En cours',
  interrupted: 'Interrompu',
}
const googleConsole =
  'https://search.google.com/search-console?resource_id=sc-domain%3Ashinecosmetics.ma'

function Delta({ row }: { row: Comparison }) {
  if (row.positionDelta == null) return <span className={styles.muted}>—</span>
  const improved = row.positionDelta < 0
  return (
    <span
      className={
        improved
          ? styles.positive
          : row.positionDelta >= 1
            ? styles.negative
            : styles.muted
      }
    >
      {improved ? <ArrowUp size={13} /> : <ArrowDown size={13} />}{' '}
      {number(Math.abs(row.positionDelta), 1)}
    </span>
  )
}
function Metric({
  label,
  current,
  previous,
  kind,
  comparable,
}: {
  label: string
  current: Metrics | undefined
  previous: Metrics | undefined
  kind: keyof Metrics
  comparable: boolean
}) {
  const value = current?.[kind]
  const prev = previous?.[kind]
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>
        {kind === 'ctr'
          ? percent(value)
          : number(value, kind === 'position' ? 1 : 0)}
      </strong>
      <small>
        {comparable
          ? `Avant : ${kind === 'ctr' ? percent(prev) : number(prev, kind === 'position' ? 1 : 0)}`
          : current
            ? 'Période partiellement importée'
            : 'En attente de Google'}
        {kind === 'position' && ' · plus bas = mieux'}
      </small>
    </div>
  )
}

export default function SeoDashboard() {
  const pathname = usePathname()
  const search = useSearchParams()
  const days = search.get('days') === '7' ? '7' : '28'
  const country = search.get('country') || 'mar'
  const device = search.get('device') || 'all'
  const query = search.get('query') || ''
  const page = search.get('page') || ''
  const match = search.get('match') === 'exact' ? 'exact' : 'contains'
  const [edit, setEdit] = useState({ source: query, value: query })
  const draft = edit.source === query ? edit.value : query
  const setDraft = (value: string) => setEdit({ source: query, value })
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadedKey, setLoadedKey] = useState('')
  const [receivedAt, setReceivedAt] = useState(0)
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState<'query' | 'page' | 'pair' | 'health'>('query')
  const [chartMetric, setChartMetric] = useState<
    'clicks' | 'impressions' | 'position'
  >('impressions')
  const [sort, setSort] = useState<'impressions' | 'loss' | 'position'>(
    'impressions',
  )
  const [offset, setOffset] = useState(0)
  const params = new URLSearchParams({
    days,
    country,
    device,
    query,
    page,
    match,
  }).toString()
  const requestKey = `${params}|${revision}`
  const loading = loadedKey !== requestKey
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/ops/seo?${params}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || 'Lecture impossible.')
        return body as Data
      })
      .then((body) => {
        if (controller.signal.aborted) return
        setData(body)
        setError('')
        setOffset(0)
        setReceivedAt(Date.now())
        setLoadedKey(requestKey)
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setData(null)
          setError(e.message)
          setLoadedKey(requestKey)
        }
      })
    return () => controller.abort()
  }, [params, requestKey])
  function updateFilters(changes: FilterChange) {
    const next = mergeFilterSearch(window.location.search, changes)
    // Next integrates native history with useSearchParams. These filters only
    // drive the client API: no server navigation or scroll reset is needed.
    window.history.replaceState(null, '', `${pathname}?${next}`)
  }
  function filter(key: keyof FilterChange, value: string) {
    updateFilters({ [key]: value })
  }
  function exactKeyword(term: string) {
    updateFilters({ query: term, match: 'exact' })
    setTab('page')
  }
  async function sync(mode: 'all' | 'audit') {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const r = await fetch(`/api/ops/seo/sync?mode=${mode}`, {
        method: 'POST',
      })
      const body = await r.json()
      if (!r.ok) throw new Error(body.error || 'Synchronisation impossible.')
      setMessage(body.message)
      setRevision((r) => r + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Synchronisation impossible.')
    } finally {
      setBusy(false)
    }
  }
  const report = loading ? undefined : data?.report
  const rows = useMemo(() => {
    const list = [
      ...(tab === 'pair' ? (report?.queryPages ?? []) : tab === 'page' ? (report?.pages ?? []) : (report?.queries ?? [])),
    ]
    if (sort === 'loss')
      list.sort(
        (a, b) =>
          a.current.impressions -
          a.previous.impressions -
          (b.current.impressions - b.previous.impressions),
      )
    if (sort === 'position')
      list.sort(
        (a, b) =>
          (a.current.position ?? Infinity) - (b.current.position ?? Infinity),
      )
    return list
  }, [report, tab, sort])
  function download() {
    const url = URL.createObjectURL(
      new Blob([reportCsv(rows, tab === 'pair')], { type: 'text/csv;charset=utf-8' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `shine-seo-${tab}-${days}j-${report?.end || 'export'}.csv`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const chart =
    report?.daily.map((r) => ({
      name: day(r.day),
      current: r.current?.[chartMetric] ?? null,
      previous: r.previous?.[chartMetric] ?? null,
    })) ?? []
  const isStale =
    data?.latestDay &&
    receivedAt - Date.parse(`${data.latestDay}T23:59:59Z`) > 5 * 86400000
  const health = data?.audit
  const oldIssues = new Set(data?.previousAudit?.issues.map((i) => i.url) ?? [])
  return (
    <main className={styles.page} aria-busy={loading || busy}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            ACQUISITION ORGANIQUE · GOOGLE SEARCH CONSOLE
          </p>
          <h1>SEO Insights</h1>
          <p>
            Comprendre ce qui monte, ce qui recule et ce qui mérite une action.
          </p>
        </div>
        <button
          type="button"
          className={styles.primary}
          onClick={() => sync('all')}
          disabled={busy || !data?.schemaReady || !data?.connection.configured}
        >
          <RefreshCw size={15} className={busy ? styles.spin : ''} />
          {busy ? 'Collecte en cours…' : 'Synchroniser'}
        </button>
      </header>
      <div className={styles.status}>
        <span
          className={
            data?.connection.configured ? styles.dot : styles.dotPending
          }
        />
        <strong>
          {data?.connection.configured
            ? 'Accès serveur configuré'
            : 'Connexion Google à configurer'}
        </strong>
        <span>
          {data?.latestDay
            ? `Dernière journée importée : ${day(data.latestDay)}`
            : 'Aucune position importée'}
        </span>
        <a href={googleConsole} target="_blank" rel="noreferrer">
          Search Console <ExternalLink size={12} />
        </a>
      </div>
      {error && !loading && (
        <div className={styles.error} role="alert">
          <TriangleAlert size={17} />
          <span>{error}</span>
          <button onClick={() => setRevision((r) => r + 1)}>Réessayer</button>
        </div>
      )}
      {message && (
        <p className={styles.notice} role="status">
          <Info size={16} />
          {message}
        </p>
      )}
      {data &&
        (!data.connection.configured ||
          !data.schemaReady ||
          !data.connection.cronConfigured) && (
          <section className={styles.setup}>
            <div>
              <ShieldCheck size={22} />
              <div>
                <h2>Une connexion, puis un suivi quotidien.</h2>
                <p>
                  API Search Console gratuite, accès en lecture seule. La
                  session de ton navigateur ne connecte pas automatiquement Ops.
                </p>
              </div>
            </div>
            <ol>
              <li className={data.schemaReady ? styles.done : ''}>
                {data.schemaReady ? <Check size={16} /> : <span>1</span>}
                <div>
                  <strong>Stockage des données</strong>
                  <p>
                    {data.schemaReady
                      ? 'Historique prêt à recevoir les journées Google.'
                      : 'Appliquer la migration 043_seo_insights.sql, après validation sur la base cible.'}
                  </p>
                </div>
              </li>
              <li className={data.connection.configured ? styles.done : ''}>
                {data.connection.configured ? (
                  <Check size={16} />
                ) : (
                  <span>2</span>
                )}
                <div>
                  <strong>Autoriser Google Search Console</strong>
                  <p>
                    {data.connection.account ||
                      'Créer un compte de service dédié dans Google Cloud.'}{' '}
                    Ajouter son adresse à cette propriété Search Console ;
                    activer l’API et configurer GSC_CLIENT_EMAIL /
                    GSC_PRIVATE_KEY côté serveur. Ne jamais coller la clé dans
                    un message.
                  </p>
                </div>
              </li>
              <li className={data.connection.cronConfigured ? styles.done : ''}>
                {data.connection.cronConfigured ? (
                  <Check size={16} />
                ) : (
                  <span>3</span>
                )}
                <div>
                  <strong>Activer la collecte quotidienne</strong>
                  <p>
                    Déployer le cron à 07:35 UTC et définir CRON_SECRET. Le
                    bouton Synchroniser importe l’historique progressivement,
                    par lots de 10 jours maximum.
                  </p>
                </div>
              </li>
            </ol>
            <details>
              <summary>Comment fonctionne la position par mot-clé ?</summary>
              <p>
                Google transmet une position moyenne pondérée par les
                impressions réelles. Elle varie selon le pays, l’appareil et la
                recherche. Une absence de ligne signifie « non observé », jamais
                « position 0 ». Seules les journées finalisées sont importées ;
                Google a généralement quelques jours de retard.
              </p>
              <p>
                Le détail des requêtes peut omettre des recherches anonymisées
                et des lignes au-delà des limites de l’API. Ce n’est ni un
                scraping de Google ni un suivi des positions des concurrents.
              </p>
            </details>
          </section>
        )}
      <section className={styles.filters} aria-label="Filtres SEO">
        <label>
          Période
          <select value={days} onChange={(e) => filter('days', e.target.value)}>
            <option value="28">28 jours vs précédents</option>
            <option value="7">7 jours vs précédents</option>
          </select>
        </label>
        <label>
          Pays
          <select
            value={country}
            onChange={(e) => filter('country', e.target.value)}
          >
            <option value="mar">Maroc</option>
            <option value="all">Tous les pays</option>
            <option value="fra">France</option>
          </select>
        </label>
        <label>
          Appareil
          <select
            value={device}
            onChange={(e) => filter('device', e.target.value)}
          >
            <option value="all">Tous les appareils</option>
            <option value="MOBILE">Mobile</option>
            <option value="DESKTOP">Ordinateur</option>
            <option value="TABLET">Tablette</option>
          </select>
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (match === 'exact') exactKeyword(draft)
            else filter('query', draft)
          }}
        >
          <label>
            Mot-clé {match === 'exact' ? 'exact' : 'contient'}
            <div className={styles.search}>
              <input
                value={draft}
                maxLength={120}
                placeholder="Olaplex, milk shake…"
                onChange={(e) => setDraft(e.target.value)}
              />
              <button aria-label="Filtrer les mots-clés">
                <Search size={17} />
              </button>
            </div>
          </label>
        </form>
        <label>
          Correspondance
          <select
            value={match}
            onChange={(e) => filter('match', e.target.value)}
          >
            <option value="contains">Contient</option>
            <option value="exact">Exacte</option>
          </select>
        </label>
      </section>
      <div className={styles.shortcuts}>
        <span>Accès rapide</span>
        {['olaplex', 'milk', 'salerm'].map((term) => (
          <button
            key={term}
            aria-pressed={query === term}
            onClick={() => filter('query', query === term ? '' : term)}
          >
            {term === 'milk' ? 'milk_shake' : term}
          </button>
        ))}
        {query && (
          <button onClick={() => filter('query', '')}>
            Retirer « {query} » ×
          </button>
        )}
        {page && (
          <button
            title={page}
            className={styles.pageFilter}
            onClick={() => filter('page', '')}
          >
            Page : {page.replace('https://www.shinecosmetics.ma', '')} ×
          </button>
        )}
      </div>
      {report && (
        <p className={styles.period}>
          {day(report.start)} – {day(report.end)} · comparaison{' '}
          {day(report.previousStart)} – {day(report.previousEnd)} · journées
          Google en heure du Pacifique
        </p>
      )}
      {isStale && (
        <p className={styles.warning}>
          <TriangleAlert size={16} />
          Données anciennes : la dernière journée importée remonte à plus de
          cinq jours. Vérifiez la synchronisation.
        </p>
      )}
      {report && !report.comparable && (
        <p className={styles.warning}>
          <Info size={16} />
          Historique incomplet ou limité : {report.missingSlices} lots
          journaliers manquants/plafonnés. Les alertes et écarts sont suspendus.
          {report.truncated &&
            ' Limite de lecture atteinte : réduisez la période ou les segments.'}
        </p>
      )}
      <section className={styles.metrics} aria-label="Indicateurs SEO">
        <Metric
          label="Clics organiques"
          kind="clicks"
          current={loading ? undefined : report?.current}
          previous={report?.previous}
          comparable={report?.comparable ?? false}
        />
        <Metric
          label="Impressions"
          kind="impressions"
          current={loading ? undefined : report?.current}
          previous={report?.previous}
          comparable={report?.comparable ?? false}
        />
        <Metric
          label="Taux de clic"
          kind="ctr"
          current={loading ? undefined : report?.current}
          previous={report?.previous}
          comparable={report?.comparable ?? false}
        />
        <Metric
          label="Position moyenne"
          kind="position"
          current={loading ? undefined : report?.current}
          previous={report?.previous}
          comparable={report?.comparable ?? false}
        />
      </section>
      <p className={styles.method}>
        Totaux {report?.aggregation === 'page' ? 'par page' : 'par propriété'}
        {report?.detailed
          ? ', filtrés sur les lignes détaillées disponibles'
          : ', sans addition des lignes de mots-clés'}
        . Les positions sont pondérées par les impressions. Les données absentes
        restent « — ».
      </p>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>La tendance, avant le classement.</h2>
            <p>
              Période précédente en pointillé. Les jours manquants ne sont pas
              remplacés par zéro.
            </p>
          </div>
          <label className={styles.srOnly} htmlFor="seo-chart">
            Mesure du graphique
          </label>
          <select
            id="seo-chart"
            value={chartMetric}
            onChange={(e) =>
              setChartMetric(e.target.value as typeof chartMetric)
            }
          >
            <option value="impressions">Impressions</option>
            <option value="clicks">Clics</option>
            <option value="position">Position moyenne</option>
          </select>
        </div>
        {report ? (
          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chart}
                margin={{ top: 10, left: -15, right: 12, bottom: 0 }}
              >
                <CartesianGrid stroke="#eceeea" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} minTickGap={28} />
                {SEO_RELEASES.filter(release => report.daily.some(r => r.day === release.day)).map(release => <ReferenceLine key={release.day} x={day(release.day)} stroke="#947447" strokeDasharray="3 3" label={{ value: 'Publication', position: 'insideTopRight', fontSize: 10 }} />)}
                <YAxis
                  reversed={chartMetric === 'position'}
                  tick={{ fontSize: 11 }}
                  allowDecimals={chartMetric === 'position'}
                />
                <Tooltip
                  formatter={(v) => number(typeof v === 'number' ? v : null, 1)}
                />
                <Line
                  dataKey="current"
                  name="Période actuelle"
                  stroke="#175f50"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="previous"
                  name="Période précédente"
                  stroke="#929d97"
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className={styles.empty}>
            <Search size={26} />
            <h3>
              {loading
                ? 'Lecture des données…'
                : 'Les premiers chiffres apparaîtront après connexion.'}
            </h3>
            <p>
              Pas de positions inventées, ni de zéros trompeurs. Les données
              viennent directement de Google.
            </p>
          </div>
        )}
      </section>
      <section className={styles.panel} aria-label="Repères de publication SEO">
        <div className={styles.panelHeader}><div><h2>Ce qui a changé sur le site</h2><p>Repères datés, pas une preuve de causalité. Comparez la même requête et la même page sur 7 puis 28 jours.</p></div></div>
        <div className={styles.releases}>
          {SEO_RELEASES.map(release => {
            const observed = releaseObservationDays(release.day, data?.latestDay)
            return <details key={release.day}><summary><span><time dateTime={release.day}>{day(release.day)}</time> · {release.title}</span><small>{!data?.latestDay ? 'Données non disponibles' : observed === 0 ? 'Pas encore de données après publication' : `${observed} jours après publication · ${observed < 7 ? 'recul inférieur à 7 jours' : observed < 28 ? 'recul de 7 jours atteint, pas encore 28' : 'recul de 28 jours atteint'}`}</small></summary><ul>{release.changes.map(change => <li key={change}>{change}</li>)}</ul><p>Les délais d’exploration et de réindexation varient. Vérifiez aussi le volume d’impressions et la couverture du rapport avant de conclure.</p></details>
          })}
        </div>
      </section>
      {report && (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>À examiner</h2>
              <p>
                Signaux explicables, pas un score SEO opaque. Minimum de volume
                avant d’alerter.
              </p>
            </div>
            <span className={styles.count}>{report.alerts.length}</span>
          </div>
          {report.alerts.length ? (
            <div className={styles.alerts}>
              {report.alerts.map((row) => (
                <button
                  key={row.key}
                  onClick={() => {
                    exactKeyword(row.key)
                  }}
                >
                  <span className={styles.signal} data-signal={row.signal}>
                    {signalNames[row.signal]}
                  </span>
                  <strong>{row.key}</strong>
                  <p>
                    {row.signal === 'unobserved'
                      ? `Aucune impression observée après ${number(row.previous.impressions)}. Cela ne prouve pas une désindexation.`
                      : row.signal === 'opportunity'
                        ? `${number(row.current.impressions)} impressions · position ${number(row.current.position, 1)} · CTR ${percent(row.current.ctr)}. Examiner le titre et l’intention.`
                        : `${number(row.previous.impressions)} → ${number(row.current.impressions)} impressions · position ${number(row.previous.position, 1)} → ${number(row.current.position, 1)}.`}
                  </p>
                  <small>Voir les pages concernées →</small>
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.noSignal}>
              {report.comparable
                ? 'Aucun signal ne dépasse les seuils dans ce segment. Cela ne garantit pas l’absence de problème.'
                : 'Les signaux seront calculés après import complet des deux périodes.'}
            </p>
          )}
        </section>
      )}
      <section className={styles.panel}>
        <div className={styles.tableTop}>
          <div role="tablist" aria-label="Détails SEO" className={styles.tabs}>
            {(
              [
                ['query', 'Mots-clés'],
                ['page', 'Pages'],
                ['pair', 'Requêtes × pages'],
                ['health', 'Santé technique'],
              ] as const
            ).map(([id, label]) => (
              <button
                role="tab"
                aria-selected={tab === id}
                key={id}
                onClick={() => {
                  setTab(id)
                  setOffset(0)
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {tab !== 'health' && (
            <div className={styles.tableTools}>
              <label className={styles.srOnly} htmlFor="seo-sort">
                Trier le tableau
              </label>
              <select
                id="seo-sort"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as typeof sort)
                  setOffset(0)
                }}
              >
                <option value="impressions">Visibilité</option>
                <option value="loss">Plus fortes pertes</option>
                <option value="position">Meilleures positions</option>
              </select>
              <button onClick={download} disabled={!rows.length || loading}>
                <Download size={15} />
                CSV
              </button>
            </div>
          )}
        </div>
        {tab === 'health' ? (
          <div className={styles.health}>
            <div className={styles.panelHeader}>
              <div>
                <h3>Indexation Google · pages prioritaires</h3>
                <p>
                  Version connue de Google, pas un test en direct. Aucune
                  demande d’indexation n’est envoyée.
                </p>
              </div>
            </div>
            {health?.indexing?.length ? (
              health.indexing.map((item) => (
                <article className={styles.issue} key={`index-${item.url}`}>
                  <div>
                    {item.verdict === 'PASS' ? (
                      <Check size={16} />
                    ) : (
                      <Info size={16} />
                    )}
                    <strong>
                      {item.error
                        ? 'Non vérifié'
                        : item.coverage || item.verdict || 'Non précisé'}
                    </strong>
                  </div>
                  <code>
                    {item.url.replace('https://www.shinecosmetics.ma', '') ||
                      '/'}
                  </code>
                  <p>
                    {item.error ||
                      `Dernière exploration : ${item.lastCrawl ? datetime(item.lastCrawl) : 'non fournie'}`}
                  </p>
                  {item.googleCanonical && (
                    <p>Canonique Google : {item.googleCanonical}</p>
                  )}
                  {item.declaredCanonical &&
                    item.googleCanonical &&
                    item.declaredCanonical !== item.googleCanonical && (
                      <p className={styles.negative}>
                        Google a choisi une autre canonique que celle déclarée.
                      </p>
                    )}
                </article>
              ))
            ) : (
              <p className={styles.noSignal}>
                En attente de la connexion Google et du premier contrôle :
                accueil, Olaplex, milk_shake et K-beauty.
              </p>
            )}
            <div className={styles.panelHeader}>
              <div>
                <h3>Contrôle du site public</h3>
                <p>
                  {health
                    ? `${health.checked} / ${health.discovered} URL contrôlées · ${datetime(health.checkedAt)}`
                    : 'Aucun contrôle enregistré.'}{' '}
                  Ce contrôle HTTP ne certifie pas l’indexation Google.
                </p>
              </div>
              <button
                disabled={busy || !data?.schemaReady}
                onClick={() => sync('audit')}
              >
                <RefreshCw size={14} />
                Contrôler le site
              </button>
            </div>
            {health?.sitemapError && (
              <p className={styles.error}>{health.sitemapError}</p>
            )}
            {health && !health.complete && (
              <p className={styles.warning}>
                Audit partiel : certaines URL n’ont pas pu être contrôlées. Ne
                pas interpréter l’absence d’erreur comme une validation globale.
              </p>
            )}
            {health?.issues.map((item) => (
              <article className={styles.issue} key={item.url}>
                <div>
                  <TriangleAlert size={16} />
                  <strong>{item.status ?? 'Non vérifié'}</strong>
                  {data?.previousAudit?.complete &&
                    !oldIssues.has(item.url) && <span>Nouveau</span>}
                </div>
                <code>
                  {item.url.replace('https://www.shinecosmetics.ma', '')}
                </code>
                <p>{item.issues.join(' · ')}</p>
              </article>
            ))}
            {health?.complete && !health.issues.length && (
              <p className={styles.noSignal}>
                Aucune anomalie détectée dans le périmètre contrôlé.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th>{tab === 'pair' ? 'Requête / page d’arrivée' : tab === 'query' ? 'Mot-clé' : 'Page'}</th>
                    <th>Clics</th>
                    <th>Impressions</th>
                    <th>CTR</th>
                    <th>Position</th>
                    <th>Évolution</th>
                    <th>Lecture</th>
                  </tr>
                </thead>
                <tbody>
                  {!rows.length ? (
                    <tr>
                      <td colSpan={7} className={styles.tableEmpty}>
                        {loading
                          ? 'Chargement…'
                          : report
                            ? 'Aucune ligne observée pour ces filtres. Essayez une autre recherche ou période.'
                            : 'Connectez Search Console pour consulter les mots-clés et pages.'}
                      </td>
                    </tr>
                  ) : (
                    rows.slice(offset, offset + 25).map((row) => (
                      <tr key={row.key}>
                        <th>
                          <button
                            onClick={() => {
                              if (tab === 'pair' && row.query && row.page) {
                                updateFilters({ query: row.query, page: row.page, match: 'exact' })
                              } else if (tab === 'query') {
                                exactKeyword(row.key)
                              } else {
                                filter('page', row.key)
                                setTab('query')
                              }
                            }}
                          >
                            {tab === 'pair' ? row.query : tab === 'page'
                              ? row.key.replace(
                                  'https://www.shinecosmetics.ma',
                                  '',
                                ) || '/'
                              : row.key}
                            {tab === 'pair' && <small className={styles.pairPage}>{row.page?.replace('https://www.shinecosmetics.ma', '') || '/'}</small>}
                          </button>
                        </th>
                        <td>
                          {number(row.current.clicks)}
                          <small>
                            {report?.comparable
                              ? `avant ${number(row.previous.clicks)}`
                              : 'comparaison en attente'}
                          </small>
                        </td>
                        <td>
                          {number(row.current.impressions)}
                          <small>
                            {report?.comparable
                              ? `avant ${number(row.previous.impressions)}`
                              : 'comparaison en attente'}
                          </small>
                        </td>
                        <td>{percent(row.current.ctr)}<small>{report?.comparable ? `avant ${percent(row.previous.ctr)}` : 'comparaison en attente'}</small></td>
                        <td>
                          {number(row.current.position, 1)}
                          <small>
                            {report?.comparable
                              ? `avant ${number(row.previous.position, 1)}`
                              : 'comparaison en attente'}
                          </small>
                        </td>
                        <td>
                          <Delta row={row} />
                        </td>
                        <td>
                          <span
                            className={styles.signal}
                            data-signal={row.signal}
                          >
                            {report?.comparable
                              ? signalNames[row.signal]
                              : 'Historique incomplet'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className={styles.pagination}>
              <span>
                {rows.length
                  ? `${offset + 1}–${Math.min(offset + 25, rows.length)} sur ${number(rows.length)}`
                  : '0 ligne disponible'}
              </span>
              <div>
                <button
                  disabled={offset === 0}
                  onClick={() => setOffset((n) => Math.max(0, n - 25))}
                >
                  Précédent
                </button>
                <button
                  disabled={offset + 25 >= rows.length}
                  onClick={() => setOffset((n) => n + 25)}
                >
                  Suivant
                </button>
              </div>
            </div>
            <p className={styles.method}>
              {tab === 'pair'
                ? `Chaque ligne compare une requête et sa page d’arrivée sur ${days} jours avec les ${days} jours précédents. Un clic isole ce couple. Ces lignes ne s’ajoutent pas aux totaux du site.`
                : 'Un clic sur un mot-clé affiche ses pages ; un clic sur une page affiche ses mots-clés.'}
              {' '}Les recherches anonymisées et les limites de Google empêchent une exhaustivité garantie.
              {report && <> Données arrêtées au {day(report.end)} : les changements postérieurs ne sont pas encore mesurables. Ces périodes glissantes ne prouvent pas à elles seules l’effet d’une correction SEO.</>}
            </p>
          </>
        )}
      </section>
      <details className={styles.history}>
        <summary>Collecte & méthode</summary>
        <p>
          Planification : tous les jours à 07:35 UTC, après déploiement et
          configuration. Historique cible : 56 jours, reprise automatique par
          lots. Les trois dernières journées finalisées sont relues pour
          intégrer les corrections Google. Alertes visibles dans Ops, aucun
          e-mail envoyé.
        </p>
        {data?.runs.map((run) => (
          <div key={run.id} className={styles.run}>
            <strong>{runNames[run.status] || run.status}</strong>
            <span>
              {datetime(run.started_at)} · {run.days_imported} journées
              importées
            </span>
            <p>{run.message}</p>
          </div>
        ))}
        <p>
          Search Console ne fournit pas le mot-clé de chaque session ou
          commande. Utilisez <a href="/analytics/acquisition">Acquisition</a>{' '}
          pour le parcours organique interne ; les deux sources ne doivent pas
          être fusionnées en attribution individuelle.
        </p>
        <a
          href="https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data"
          target="_blank"
          rel="noreferrer"
        >
          Méthode et limites de l’API Google ↗
        </a>
      </details>
    </main>
  )
}
