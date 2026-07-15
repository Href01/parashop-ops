'use client'

import { createReactBlockSpec } from '@blocknote/react'

/**
 * Custom BlockNote block "attachment" — an uploaded file with an INLINE preview:
 *   image → <img>, PDF → <iframe> viewer, video → <video>, audio → <audio>.
 * Header shows the name + size, a "Aperçu / Masquer" toggle (preview if we want),
 * and "Ouvrir ↗". The file URL is synced in the doc, so both founders see the preview.
 */

const GREEN = '#0C6B52', INK = '#1f2937', LINE = '#e5e7eb', MUT = '#6b7280'

const fmtSize = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} Mo` : n >= 1e3 ? `${Math.round(n / 1e3)} Ko` : `${n} o`)
const iconFor = (m: string) => (m.includes('pdf') ? '📄' : m.startsWith('image') ? '🖼️' : m.startsWith('video') ? '🎬' : m.startsWith('audio') ? '🎵' : '📎')

const btn: React.CSSProperties = { border: `1px solid ${LINE}`, background: '#fff', color: INK, borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }
const btnPrimary: React.CSSProperties = { ...btn, border: 'none', background: GREEN, color: '#fff', textDecoration: 'none' }

export const AttachmentBlock = createReactBlockSpec(
  {
    type: 'attachment',
    propSchema: {
      url: { default: '' },
      name: { default: 'fichier' },
      mime: { default: '' },
      size: { default: 0 },
      preview: { default: true },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const { url, name, mime, size, preview } = block.props as { url: string; name: string; mime: string; size: number; preview: boolean }
      const isImg = mime.startsWith('image')
      const isPdf = mime === 'application/pdf'
      const isVid = mime.startsWith('video')
      const isAud = mime.startsWith('audio')
      const canPreview = !!url && (isImg || isPdf || isVid || isAud)
      const toggle = () => editor.updateBlock(block, { props: { preview: !preview } })

      return (
        <div contentEditable={false} style={{ border: `1px solid ${LINE}`, borderRadius: 12, overflow: 'hidden', margin: '8px 0', background: '#fff', userSelect: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#FAFAF9' }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{iconFor(mime)}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name || 'fichier'}</div>
              <div style={{ fontSize: 11, color: MUT }}>{(mime || 'fichier')}{size ? ` · ${fmtSize(size)}` : ''}</div>
            </div>
            {canPreview && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={toggle} style={btn}>{preview ? 'Masquer' : 'Aperçu'}</button>}
            {url ? <a href={url} target="_blank" rel="noreferrer" style={btnPrimary}>Ouvrir ↗</a> : null}
          </div>

          {canPreview && preview && (
            <div style={{ borderTop: `1px solid ${LINE}`, background: isImg ? '#0b0b0b' : '#fff' }}>
              {isImg && <img src={url} alt={name} style={{ display: 'block', maxWidth: '100%', maxHeight: 520, margin: '0 auto', objectFit: 'contain' }} />}
              {isPdf && <iframe src={url} title={name} style={{ width: '100%', height: 560, border: 0, display: 'block' }} />}
              {isVid && <video src={url} controls style={{ display: 'block', width: '100%', maxHeight: 520, background: '#000' }} />}
              {isAud && <audio src={url} controls style={{ display: 'block', width: '100%', padding: 12 }} />}
            </div>
          )}
        </div>
      )
    },
  }
)
