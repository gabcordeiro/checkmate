'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Portal from './Portal'

/**
 * A foto do cheque, em duas variantes:
 *   miniatura — ao lado da linha na tela do lote
 *   painel    — grande, no modo conferência
 *
 * As duas abrem a mesma tela cheia com zoom, porque a conferência final é
 * visual: sem olhar a foto a operadora não confia no alerta.
 *
 * A tela cheia usa a transição "Modal open / close" do transitions.dev: abre
 * escalando de 0.96, e no fechar mergulha de volta — o que exige manter o
 * elemento montado durante o fechamento (`is-closing`) antes de remover.
 */

const DURACAO_FECHAMENTO = 150

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
  const querAberta = controlada ? Boolean(abertaControlada) : abertaLocal

  // `montada` sobrevive ao pedido de fechar até a animação terminar.
  const [montada, setMontada] = useState(querAberta)
  const [fase, setFase] = useState<'entrando' | 'aberta' | 'fechando'>('entrando')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (frame.current) cancelAnimationFrame(frame.current)

    if (querAberta) {
      setMontada(true)
      setFase('entrando')
      // Um frame no estado inicial para o browser ter de onde animar.
      frame.current = requestAnimationFrame(() => setFase('aberta'))
      return
    }

    if (montada) {
      setFase('fechando')
      timer.current = setTimeout(() => setMontada(false), DURACAO_FECHAMENTO)
    }
    // `montada` de propósito fora das deps: incluí-lo reiniciaria o fechamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [querAberta])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [])

  const fechar = useCallback(() => {
    if (controlada) onFechar?.()
    else setAbertaLocal(false)
  }, [controlada, onFechar])

  useEffect(() => {
    if (!montada) return
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.stopPropagation()
        fechar()
      }
    }
    window.addEventListener('keydown', aoTeclar, true)
    return () => window.removeEventListener('keydown', aoTeclar, true)
  }, [montada, fechar])

  if (!url) {
    return (
      <div
        className={
          variante === 'painel'
            ? 'flex h-64 w-full items-center justify-center rounded-lg border border-dashed border-tinta-300 text-xs text-tinta-400'
            : 'flex h-12 w-20 items-center justify-center rounded border border-dashed border-tinta-300 text-[10px] text-tinta-400'
        }
      >
        sem foto
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (controlada ? undefined : setAbertaLocal(true))}
        className={
          variante === 'painel'
            ? 'block w-full overflow-hidden rounded-lg border border-tinta-200 bg-tinta-100'
            : 'group relative block h-12 w-20 shrink-0 overflow-hidden rounded border border-tinta-200 bg-tinta-100'
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
              : 'h-full w-full object-cover transition-transform duration-200 group-hover:scale-105'
          }
          loading={variante === 'painel' ? 'eager' : 'lazy'}
        />
      </button>

      {montada && (
        <Portal>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Foto do cheque ${legenda}`}
            onClick={fechar}
            className={`t-modal fixed inset-0 z-50 flex items-center justify-center bg-tinta-950/90 p-4 ${
              fase === 'aberta' ? 'is-open' : fase === 'fechando' ? 'is-closing' : ''
            }`}
          >
            <div
              className="max-h-full max-w-5xl overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
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
        </Portal>
      )}
    </>
  )
}
