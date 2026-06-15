'use client'

import { useState } from 'react'
import { Upload, X, Check, AlertCircle } from 'lucide-react'

interface ImportResult {
  sku: string
  name: string
  supplier: string
  status: 'success' | 'error' | 'not_found'
  message?: string
}

interface Props {
  onClose: () => void
  onComplete: () => void
}

export default function ImportSuppliersCSV({ onClose, onComplete }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[]>([])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0])
      setResults([])
    }
  }

  const handleImport = async () => {
    if (!file) return

    setImporting(true)
    try {
      // Read CSV
      const text = await file.text()
      const lines = text.split('\n').filter(l => l.trim())

      if (lines.length < 2) {
        alert('CSV vide ou invalide')
        setImporting(false)
        return
      }

      // Parse header
      const header = lines[0].toLowerCase().split(',').map(h => h.trim())
      const skuIdx = header.findIndex(h => h === 'sku' || h === 'ref')
      const nameIdx = header.findIndex(h => h === 'name' || h === 'nom' || h === 'product')
      const supplierIdx = header.findIndex(h => h === 'supplier' || h === 'fournisseur')

      if (supplierIdx === -1) {
        alert('Colonne "supplier" ou "fournisseur" requise dans le CSV')
        setImporting(false)
        return
      }

      if (skuIdx === -1 && nameIdx === -1) {
        alert('Colonne "sku" ou "name" requise pour identifier les produits')
        setImporting(false)
        return
      }

      // Parse rows
      const updates: Array<{ sku?: string; name?: string; supplier: string }> = []
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',').map(c => c.trim())
        const sku = skuIdx >= 0 ? cells[skuIdx] : undefined
        const name = nameIdx >= 0 ? cells[nameIdx] : undefined
        const supplier = cells[supplierIdx]

        if ((sku || name) && supplier) {
          updates.push({ sku, name, supplier })
        }
      }

      // Send to API
      const res = await fetch('/api/ops/products/import-suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })

      if (!res.ok) throw new Error('Import failed')

      const data = await res.json()
      setResults(data.results || [])

      // Refresh products list after import
      if (data.results.some((r: ImportResult) => r.status === 'success')) {
        onComplete()
      }
    } catch (error) {
      console.error('Import error:', error)
      alert('Erreur lors de l\'import')
    } finally {
      setImporting(false)
    }
  }

  const successCount = results.filter(r => r.status === 'success').length
  const errorCount = results.filter(r => r.status === 'error').length
  const notFoundCount = results.filter(r => r.status === 'not_found').length

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50,
    }} onClick={onClose}>
      <div className="card-modern" style={{ maxWidth: 600, width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div className="card-header">
          <Upload className="w-5 h-5" />
          <h3 className="text-lg font-semibold">Importer fournisseurs (CSV)</h3>
          <div className="flex-1"></div>
          <button onClick={onClose} className="btn-modern btn-icon btn-subtle">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="card-body" style={{ flex: 1, overflowY: 'auto' }}>
          {results.length === 0 ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 13, color: 'var(--tx-mid)', marginBottom: 12 }}>
                  Format CSV attendu (virgule comme séparateur) :
                </p>
                <pre style={{
                  background: 'var(--bg-2)',
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: 'var(--mono)',
                  color: 'var(--tx-hi)',
                  overflowX: 'auto',
                }}>
{`sku,name,supplier
OLAPLEX3,Olaplex No.3,Beauty Supply Morocco
SALERM21,Salerm 21 Shampooing,Salerm Espagne`}
                </pre>
                <ul style={{ fontSize: 12, color: 'var(--tx-lo)', marginTop: 12, paddingLeft: 20 }}>
                  <li>Colonnes requises : <b>sku</b> ou <b>name</b> (identifiant) + <b>supplier</b></li>
                  <li>En-têtes acceptées : sku/ref, name/nom/product, supplier/fournisseur</li>
                  <li>Les produits non trouvés seront listés en erreur</li>
                </ul>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="fs12 tx-mid fw600" style={{ display: 'block', marginBottom: 6 }}>
                  Fichier CSV
                </label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid var(--line)',
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                />
                {file && (
                  <div className="fs11 tx-lo" style={{ marginTop: 4 }}>
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </div>
                )}
              </div>
            </>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: '8px 12px', background: 'var(--green-bg)', borderRadius: 6, fontSize: 13 }}>
                  <Check className="w-4 h-4" style={{ display: 'inline', marginRight: 4, color: 'var(--green)' }} />
                  <b style={{ color: 'var(--green)' }}>{successCount}</b> réussi(s)
                </div>
                {notFoundCount > 0 && (
                  <div style={{ padding: '8px 12px', background: 'var(--amber-bg)', borderRadius: 6, fontSize: 13 }}>
                    <AlertCircle className="w-4 h-4" style={{ display: 'inline', marginRight: 4, color: 'var(--amber)' }} />
                    <b style={{ color: 'var(--amber)' }}>{notFoundCount}</b> non trouvé(s)
                  </div>
                )}
                {errorCount > 0 && (
                  <div style={{ padding: '8px 12px', background: 'var(--red-bg)', borderRadius: 6, fontSize: 13 }}>
                    <X className="w-4 h-4" style={{ display: 'inline', marginRight: 4, color: 'var(--red)' }} />
                    <b style={{ color: 'var(--red)' }}>{errorCount}</b> erreur(s)
                  </div>
                )}
              </div>

              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {results.map((r, i) => (
                  <div key={i} style={{
                    padding: '8px 10px',
                    marginBottom: 6,
                    background: 'var(--bg-2)',
                    borderRadius: 6,
                    borderLeft: `3px solid ${r.status === 'success' ? 'var(--green)' : r.status === 'not_found' ? 'var(--amber)' : 'var(--red)'}`,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.name || r.sku}</div>
                    <div style={{ fontSize: 11, color: 'var(--tx-lo)' }}>
                      Fournisseur: <b>{r.supplier}</b> • {r.message || (r.status === 'success' ? 'Mis à jour' : r.status === 'not_found' ? 'Produit non trouvé' : 'Erreur')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card-footer" style={{ borderTop: '1px solid var(--line-soft)', padding: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {results.length > 0 ? (
            <button className="btn-modern btn-primary" onClick={onClose}>
              Fermer
            </button>
          ) : (
            <>
              <button className="btn-modern btn-secondary" onClick={onClose}>
                Annuler
              </button>
              <button
                className="btn-modern btn-primary"
                onClick={handleImport}
                disabled={!file || importing}
              >
                {importing ? 'Import en cours…' : 'Importer'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
