'use client'

import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, MapPin, Package, Search } from 'lucide-react'

export interface OrderProductOption {
  id: number
  name: string
  price: number
  costPrice: number
  brand?: string
  sku?: string
  image?: string
  stock: number
  available: number
  trackInventory: boolean
  importUnavailable: boolean
}

export interface DistrictOption {
  id: number
  ville: string
  name: string
  arabic_name: string
  price: number
  delais: string
}

const normalize = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

function ProductThumb({ product }: { product: OrderProductOption }) {
  return product.image ? (
    <span
      className="picker-thumb"
      style={{ backgroundImage: `url("${product.image.replace(/"/g, '%22')}")` }}
      aria-hidden="true"
    />
  ) : (
    <span className="picker-thumb picker-thumb-fallback" aria-hidden="true"><Package size={16} /></span>
  )
}

export function ProductSearchPicker({
  products,
  selectedIds,
  loading,
  onSelect,
  error,
}: {
  products: OrderProductOption[]
  selectedIds: number[]
  loading: boolean
  onSelect: (product: OrderProductOption) => void
  error?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const blurTimer = useRef<number | null>(null)
  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const filtered = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean)
    return products
      .filter((product) => !selected.has(product.id))
      .filter((product) => {
        const haystack = normalize([product.name, product.brand, product.sku].filter(Boolean).join(' '))
        return terms.every((term) => haystack.includes(term))
      })
      .slice(0, 12)
  }, [products, query, selected])

  const choose = (product: OrderProductOption) => {
    const unavailable = product.importUnavailable || (product.trackInventory && product.available <= 0)
    if (unavailable) return
    onSelect(product)
    setQuery('')
    setOpen(false)
    setActive(0)
  }

  return (
    <div className="picker-root">
      <div className={`picker-input-wrap ${error ? 'has-error' : ''}`}>
        <Search size={16} aria-hidden="true" />
        <input
          id="product-search"
          className="picker-input"
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 120) }}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0) }}
          onKeyDown={(event) => {
            if (!open || filtered.length === 0) return
            if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(filtered.length - 1, value + 1)) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(0, value - 1)) }
            if (event.key === 'Enter') { event.preventDefault(); choose(filtered[active]) }
            if (event.key === 'Escape') setOpen(false)
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls="product-results"
          aria-autocomplete="list"
          aria-invalid={Boolean(error)}
          placeholder={loading ? 'Chargement du catalogue…' : 'Rechercher par nom, marque ou SKU'}
          disabled={loading}
          autoComplete="off"
        />
        {!loading && <span className="picker-count">{products.length} produits</span>}
      </div>
      {error && <p className="picker-error"><AlertTriangle size={13} />{error}</p>}

      {open && !loading && (
        <div id="product-results" className="picker-results" role="listbox">
          {filtered.length === 0 ? (
            <div className="picker-empty">Aucun produit disponible pour cette recherche.</div>
          ) : filtered.map((product, index) => {
            const unavailable = product.importUnavailable || (product.trackInventory && product.available <= 0)
            return (
              <button
                key={product.id}
                type="button"
                role="option"
                aria-selected={index === active}
                disabled={unavailable}
                className={`picker-option ${index === active ? 'is-active' : ''}`}
                onMouseDown={() => { if (blurTimer.current) window.clearTimeout(blurTimer.current) }}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(product)}
              >
                <ProductThumb product={product} />
                <span className="picker-main">
                  <strong>{product.name}</strong>
                  <small>{[product.brand, product.sku].filter(Boolean).join(' · ') || 'Sans référence'}</small>
                </span>
                <span className="picker-side">
                  <strong>{Number(product.price).toFixed(2)} MAD</strong>
                  <small className={unavailable ? 'danger' : product.trackInventory && product.available <= 3 ? 'warning' : ''}>
                    {product.importUnavailable
                      ? 'Import indisponible'
                      : product.trackInventory
                        ? `${Math.max(0, product.available)} disponible${product.available > 1 ? 's' : ''}`
                        : 'Sur commande'}
                  </small>
                  {!Number(product.costPrice) && <small className="warning">Coût manquant</small>}
                </span>
              </button>
            )
          })}
        </div>
      )}
      <style jsx>{pickerStyles}</style>
    </div>
  )
}

export function DistrictSearchPicker({
  districts,
  selectedId,
  loading,
  onSelect,
  error,
}: {
  districts: DistrictOption[]
  selectedId: number | null
  loading: boolean
  onSelect: (district: DistrictOption | null) => void
  error?: string
}) {
  const selected = districts.find((district) => district.id === selectedId) || null
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const blurTimer = useRef<number | null>(null)
  const filtered = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean)
    const matches = districts.filter((district) => {
      const haystack = normalize(`${district.name} ${district.ville} ${district.arabic_name || ''}`)
      return terms.every((term) => haystack.includes(term))
    })
    return matches.slice(0, 14)
  }, [districts, query])

  const choose = (district: DistrictOption) => {
    onSelect(district)
    setQuery('')
    setOpen(false)
    setActive(0)
  }

  return (
    <div className="picker-root">
      <div className={`picker-input-wrap ${error ? 'has-error' : ''}`}>
        <Search size={16} aria-hidden="true" />
        <input
          id="district-search"
          className="picker-input"
          value={open ? query : selected?.name || query}
          onFocus={(event) => { setOpen(true); setQuery(''); event.currentTarget.select() }}
          onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 120) }}
          onChange={(event) => { setQuery(event.target.value); onSelect(null); setOpen(true); setActive(0) }}
          onKeyDown={(event) => {
            if (!open || filtered.length === 0) return
            if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(filtered.length - 1, value + 1)) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(0, value - 1)) }
            if (event.key === 'Enter') { event.preventDefault(); choose(filtered[active]) }
            if (event.key === 'Escape') setOpen(false)
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls="district-results"
          aria-autocomplete="list"
          aria-invalid={Boolean(error)}
          placeholder={loading ? 'Chargement des destinations…' : 'Ville ou quartier, ex. Maarif'}
          disabled={loading}
          autoComplete="off"
        />
        {!loading && <span className="picker-count">{districts.length} zones</span>}
      </div>
      {error && <p className="picker-error"><AlertTriangle size={13} />{error}</p>}

      {open && !loading && (
        <div id="district-results" className="picker-results" role="listbox">
          {filtered.length === 0 ? (
            <div className="picker-empty">Aucune destination Sendit trouvée.</div>
          ) : filtered.map((district, index) => (
            <button
              key={district.id}
              type="button"
              role="option"
              aria-selected={index === active}
              className={`picker-option district-option ${index === active ? 'is-active' : ''}`}
              onMouseDown={() => { if (blurTimer.current) window.clearTimeout(blurTimer.current) }}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(district)}
            >
              <span className="picker-thumb picker-thumb-fallback" aria-hidden="true"><MapPin size={16} /></span>
              <span className="picker-main"><strong>{district.name}</strong><small>{district.ville} · {district.delais}</small></span>
              <span className="picker-side"><strong>{Number(district.price).toFixed(2)} MAD</strong>{selectedId === district.id && <small className="success"><Check size={12} />Sélectionnée</small>}</span>
            </button>
          ))}
        </div>
      )}
      <style jsx>{pickerStyles}</style>
    </div>
  )
}

const pickerStyles = `
  .picker-root { position: relative; }
  .picker-input-wrap { min-height: 44px; display: flex; align-items: center; gap: 9px; background: var(--bg-inset); border: 1px solid var(--line-soft); border-radius: 7px; padding: 0 11px; transition: border-color .15s, box-shadow .15s, background .15s; }
  .picker-input-wrap:focus-within { border-color: var(--rose); box-shadow: 0 0 0 3px var(--rose-bg); background: var(--bg-1); }
  .picker-input-wrap.has-error { border-color: var(--red); }
  .picker-input-wrap :global(svg) { color: var(--tx-lo); flex: 0 0 auto; }
  .picker-input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--tx-hi); font: 500 13px/1.3 var(--font); }
  .picker-input::placeholder { color: var(--tx-faint); }
  .picker-count { flex: 0 0 auto; color: var(--tx-faint); font: 600 10.5px/1 var(--font); }
  .picker-results { position: absolute; z-index: 40; top: calc(100% + 6px); left: 0; right: 0; max-height: 360px; overflow: auto; background: var(--bg-1); border: 1px solid var(--line); border-radius: 8px; box-shadow: 0 12px 32px rgba(20, 24, 35, .14); padding: 5px; }
  .picker-option { width: 100%; min-height: 58px; display: flex; align-items: center; gap: 10px; border: 0; border-radius: 6px; background: transparent; color: inherit; padding: 7px 9px; text-align: left; cursor: pointer; }
  .picker-option:hover, .picker-option.is-active { background: var(--bg-2); }
  .picker-option:disabled { cursor: not-allowed; opacity: .56; }
  .picker-thumb { width: 40px; height: 40px; flex: 0 0 40px; border-radius: 6px; border: 1px solid var(--line-soft); background-size: cover; background-position: center; }
  .picker-thumb-fallback { display: inline-flex; align-items: center; justify-content: center; color: var(--tx-lo); background: var(--bg-3); }
  .picker-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
  .picker-main strong { font-size: 12.5px; font-weight: 650; line-height: 1.3; color: var(--tx-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .picker-main small, .picker-side small { font-size: 10.5px; color: var(--tx-lo); line-height: 1.2; }
  .picker-side { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
  .picker-side strong { font: 700 11.5px/1.2 var(--mono); color: var(--tx-hi); }
  .picker-side small.warning, .picker-error { color: var(--amber); }
  .picker-side small.danger { color: var(--red); }
  .picker-side small.success { color: var(--green); display: inline-flex; align-items: center; gap: 3px; }
  .picker-error { display: flex; align-items: center; gap: 5px; margin: 5px 0 0; font-size: 11px; }
  .picker-empty { padding: 18px 12px; text-align: center; color: var(--tx-lo); font-size: 12px; }
  @media (max-width: 520px) {
    .picker-count { display: none; }
    .picker-results { position: fixed; z-index: 90; left: 12px; right: 12px; top: 112px; max-height: min(65vh, 520px); }
    .picker-option { min-height: 64px; }
    .picker-main strong { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    .picker-side strong { font-size: 11px; }
  }
`
