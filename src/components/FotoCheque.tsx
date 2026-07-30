'use client'

import { useEffect, useState } from 'react'

/**
 * A foto do cheque, em duas variantes:
 *   miniatura — ao lado da linha na tela do lote
 *   painel    — grande, no modo conferência
 *
 * As duas abrem a mesma tela cheia com zoom, porque a conferência final é
 * visual: sem olhar a foto a operadora não confia no alerta.
 */
export default function FotoCheque({
  url,
  legenda,
  variante = 'miniatura',
  aberta: abertaControlada,
  onFechar,
}: {
  url: string | null
  legenda: string
  variante?: 'miniatura' | 'painel'
  /** Permite abrir a tela cheia de fora (atalho de teclado do modo conferência). */
  aberta?: boolean
  onFechar?: () => void
}) {
  const [abertaLocal, setAbertaLocal] = useState(false)
  const controlada = abertaControlada !== undefined
  const aberta = controlada ? abertaControlada : abertaLocal

  function fechar() {
    if (controlada) onFechar?.()
    else setAbertaLocal(false)
  }

  useEffect(() => {
    if (!aberta) return
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.stopPropagation()
        if (controlada) onFechar?.()
        else setAbertaLocal(false)
      }
    }
    window.addEventListener('keydown', aoTeclar, true)
    return () => window.removeEventListener('keydown', aoTeclar, true)
  }, [aberta, controlada, onFechar])

  const vazio = (
    <div
      className={
        variante === 'painel'
          ? 'flex h-64 w-full items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400'
          : 'flex h-12 w-20 items-center justify-center rounded border border-dashed border-slate-300 text-[10px] text-slate-400'
      }
    >
      sem foto
    </div>
  )

  return (
    <>
      {!url ? (
        vazio
      ) : (
        <button
          type="button"
          onClick={() => (controlada ? undefined : setAbertaLocal(true))}
          className={
            variante === 'painel'
              ? 'block w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100'
              : 'group relative block h-12 w-20 shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-100'
          }
          title="Ampliar a foto do cheque"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`Foto do cheque ${legenda}`}
            className={
              variante === 'painel'
                ? 'max-h-[46vh] w-full object-contain'
                : 'h-full w-full object-cover transition group-hover:scale-105'
            }
            loading={variante === 'painel' ? 'eager' : 'lazy'}
          />
        </button>
      )}

      {aberta && url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto do cheque ${legenda}`}
          onClick={fechar}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/85 p-4"
        >
          <div className="max-h-full max-w-5xl overflow-auto" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Foto ampliada do cheque ${legenda}`}
              className="max-w-none rounded-lg bg-white shadow-2xl"
              style={{ width: 'min(1600px, 220vw)' }}
            />
          </div>
          <button
            type="button"
            onClick={fechar}
            className="absolute right-4 top-4 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium"
          >
            Fechar (Esc)
          </button>
        </div>
      )}
    </>
  )
}
