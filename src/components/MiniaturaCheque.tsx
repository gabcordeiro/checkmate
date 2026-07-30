'use client'

import { useEffect, useState } from 'react'

/**
 * Miniatura da foto ao lado da linha, expansível. A conferência final é
 * visual — sem olhar a foto a operadora não confia no alerta.
 */
export default function MiniaturaCheque({
  url,
  legenda,
}: {
  url: string | null
  legenda: string
}) {
  const [aberta, setAberta] = useState(false)

  useEffect(() => {
    if (!aberta) return
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberta(false)
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberta])

  if (!url) {
    return (
      <div className="flex h-12 w-20 items-center justify-center rounded border border-dashed border-slate-300 text-[10px] text-slate-400">
        sem foto
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="group relative block h-12 w-20 shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-100"
        title="Ampliar a foto do cheque"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={`Foto do cheque ${legenda}`}
          className="h-full w-full object-cover transition group-hover:scale-105"
          loading="lazy"
        />
      </button>

      {aberta && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto do cheque ${legenda}`}
          onClick={() => setAberta(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
        >
          <div className="max-h-full max-w-4xl overflow-auto" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Foto ampliada do cheque ${legenda}`}
              className="max-w-none rounded-lg bg-white shadow-2xl"
              style={{ width: 'min(1400px, 200vw)' }}
            />
          </div>
          <button
            type="button"
            onClick={() => setAberta(false)}
            className="absolute right-4 top-4 rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium"
          >
            Fechar
          </button>
        </div>
      )}
    </>
  )
}
