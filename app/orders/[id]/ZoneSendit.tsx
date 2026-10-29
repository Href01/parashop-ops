'use client'

/**
 * LA DESTINATION SENDIT D'UNE COMMANDE — la voir, et la choisir.
 *
 * Sendit refuse de creer un colis sans zone exacte (« Select the exact Sendit city/district
 * before creating a shipment »). Une commande du site peut arriver sans zone (quartier non
 * reconnu), et la page n'offrait que la ville en TEXTE : l'equipe pouvait la corriger a l'infini,
 * l'erreur ne partait jamais. Ici on choisit la zone, avec la meme liste que « Nouvelle commande ».
 *
 * Trois etats : zone choisie (modifiable), zone absente (bloquant, mis en avant), colis deja cree
 * (verrouille : la destination est celle du bordereau Sendit).
 */

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, MapPin } from 'lucide-react'
import { DistrictSearchPicker, type DistrictOption } from '../new/OrderSearchPickers'
import { suggererZones } from '@/lib/sendit-zones'

export default function ZoneSendit({
  orderId, deliveryCity, districtId, colisCree, onSaved,
}: {
  orderId: string | number
  deliveryCity?: string | null
  districtId?: number | null
  /** Un colis Sendit existe deja : la destination ne se change plus ici. */
  colisCree: boolean
  /** Appelee apres l'enregistrement, avec le message a afficher : la page recharge la commande, ce qui
   *  remonte ce composant et efface tout message local. */
  onSaved: (message: string) => void | Promise<void>
}) {
  const [zones, setZones] = useState<DistrictOption[]>([])
  const [chargement, setChargement] = useState(true)
  const [erreurListe, setErreurListe] = useState('')
  const [choix, setChoix] = useState<DistrictOption | null>(null)
  const [modifier, setModifier] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState('')
  const [enregistree, setEnregistree] = useState('')

  useEffect(() => {
    let vivant = true
    fetch('/api/ops/districts')
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (!r.ok || !Array.isArray(j)) throw new Error(j?.error || 'Liste des zones indisponible')
        if (vivant) setZones(j as DistrictOption[])
      })
      .catch((e) => vivant && setErreurListe(e instanceof Error ? e.message : 'Liste des zones indisponible'))
      .finally(() => vivant && setChargement(false))
    return () => { vivant = false }
  }, [])

  const actuelle = useMemo(() => zones.find((z) => z.id === districtId) ?? null, [zones, districtId])
  const suggestions = useMemo(() => suggererZones(deliveryCity, zones), [deliveryCity, zones])
  const manquante = !districtId && !colisCree

  async function enregistrer() {
    if (!choix) return
    setEnCours(true); setErreur(''); setEnregistree('')
    try {
      const res = await fetch(`/api/ops/orders/${orderId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senditDistrictId: choix.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.details || j.error || `Échec (${res.status})`)
      const message = `Zone Sendit enregistrée : ${choix.name}`
      setEnregistree(message)
      setChoix(null); setModifier(false)
      await onSaved(message)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de l’enregistrement')
    } finally {
      setEnCours(false)
    }
  }

  const ligneZone = (z: DistrictOption) =>
    `${z.name} · ${z.ville}${z.price != null ? ` · ${Number(z.price).toFixed(0)} MAD` : ''}${z.delais ? ` · ${z.delais}` : ''}`

  return (
    <div id="destination-sendit" style={{
      margin: '0 0 12px', padding: '12px 14px', borderRadius: 10,
      border: `1px solid ${manquante ? 'var(--amber, #d97706)' : 'var(--line, #e5e5e0)'}`,
      background: manquante ? 'var(--amber-bg, #fff7e6)' : 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
        <MapPin size={15} aria-hidden="true" />
        Destination Sendit
        {districtId && !manquante && <CheckCircle2 size={14} style={{ color: 'var(--green, #15803d)' }} aria-label="Zone choisie" />}
      </div>

      {colisCree && (
        <p style={{ margin: '6px 0 0', fontSize: 12 }}>
          {actuelle ? <><b>{actuelle.name}</b> · {actuelle.ville}. </> : null}
          Le colis existe déjà : sa destination se change sur Sendit, pas ici.
        </p>
      )}

      {!colisCree && districtId && !modifier && (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          <div>{actuelle ? ligneZone(actuelle) : `Zone n° ${districtId}`}</div>
          <button type="button" onClick={() => { setModifier(true); setEnregistree('') }}
            style={{ marginTop: 6, fontSize: 12, fontWeight: 600, textDecoration: 'underline', background: 'none', border: 0, padding: 0, cursor: 'pointer', minHeight: 32 }}>
            Modifier la zone
          </button>
        </div>
      )}

      {manquante && (
        <p style={{ margin: '6px 0 8px', fontSize: 12 }}>
          <AlertTriangle size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} aria-hidden="true" />
          <b>Aucune zone Sendit choisie : le colis ne peut pas être créé.</b>
          {deliveryCity ? <> La ville saisie est « {deliveryCity} ».</> : null}
        </p>
      )}

      {!colisCree && (manquante || modifier) && (
        <div style={{ marginTop: manquante ? 0 : 8 }}>
          <DistrictSearchPicker
            districts={zones}
            selectedId={choix?.id ?? null}
            loading={chargement}
            error={erreurListe || undefined}
            onSelect={(z) => { setChoix(z); setErreur('') }}
          />

          {suggestions.type === 'propositions' && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, opacity: .7 }}>Correspond à « {deliveryCity} » :</span>
              {suggestions.zones.map((z) => (
                <button key={z.id} type="button" onClick={() => { setChoix(z); setErreur('') }}
                  aria-pressed={choix?.id === z.id}
                  style={{
                    fontSize: 12, fontWeight: 600, borderRadius: 8, padding: '6px 10px', minHeight: 32, cursor: 'pointer',
                    border: `1px solid ${choix?.id === z.id ? 'var(--ink, #111)' : 'var(--line, #d4d4cf)'}`,
                    background: choix?.id === z.id ? 'var(--ink, #111)' : '#fff', color: choix?.id === z.id ? '#fff' : 'inherit',
                  }}>
                  {z.name}
                </button>
              ))}
            </div>
          )}
          {suggestions.type === 'trop-large' && (
            <p style={{ margin: '8px 0 0', fontSize: 11, opacity: .75 }}>
              « {deliveryCity} » correspond à {suggestions.total} zones : cherche le quartier dans la liste (nom ou arabe) plutôt que de deviner.
            </p>
          )}

          {choix && (
            <p style={{ margin: '8px 0 0', fontSize: 12 }}>
              Choix : <b>{ligneZone(choix)}</b>
            </p>
          )}

          <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={enregistrer} disabled={!choix || enCours}
              style={{ minHeight: 36 }}>
              {enCours ? 'Enregistrement…' : 'Enregistrer la zone'}
            </button>
            {modifier && (
              <button type="button" onClick={() => { setModifier(false); setChoix(null); setErreur('') }}
                style={{ fontSize: 12, textDecoration: 'underline', background: 'none', border: 0, cursor: 'pointer', minHeight: 36 }}>
                Annuler
              </button>
            )}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 11, opacity: .65 }}>
            Les frais facturés à la cliente et le coût estimé ne changent pas : vérifie-les si la nouvelle zone n’a pas le même tarif.
          </p>
        </div>
      )}

      {erreur && <p role="alert" style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--red, #b91c1c)' }}>{erreur}</p>}
      {enregistree && <p role="status" style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--green, #15803d)' }}>{enregistree}</p>}
    </div>
  )
}
