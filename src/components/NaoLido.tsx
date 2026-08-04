'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Portal from './Portal'

/**
 * O `?` vermelho: "o sistema não conseguiu ler isto".
 *
 * Desenho pedido pela operadora, depois de travar num alerta que explicava a
 * conferência interna do CMC7: *"seria melhor você colocar apenas o CMC7 que
 * conseguiu entender, e nos números que não conseguiu você coloca uma
 * interrogação vermelha. Ponto. E aí em 'entender' abre uma janela falando que
 * o sistema não conseguiu ler este ?, apenas isso."*
 *
 * Então é isso e nada mais: a marca, e uma janela de uma frase com o caminho
 * para resolver. Sem "por que importa", sem exemplo, sem teoria.
 */

const DURACAO_FECHAMENTO = 150

export default function NaoLido({
  campo,
  rotulo,
  onCorrigir,
  onVerFoto,
  variante = 'inline',
}: {
  /** Nome do campo em linguagem de gente: "valor em números", "data do cheque". */
  campo: string
  /**
   * Etiqueta curta ao lado do `?` na variante `bloco` — "valor", "data".
   *
   * Sem ela, três campos não lidos viram três `?` idênticos lado a lado e a
   * operadora não sabe qual é qual sem clicar em cada um.
   */
  rotulo?: string
  onCorrigir?: () => void
  onVerFoto?: () => void
  /** `inline` = no meio de um número; `bloco` = no lugar do campo inteiro. */
  variante?: 'inline' | 'bloco'
}) {
  const [aberta, setAberta] = useState(false)
  const [montada, setMontada] = useState(false)
  const [fase, setFase] = useState<'entrando' | 'aberta' | 'fechando'>('entrando')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (frame.current) cancelAnimationFrame(frame.current)

    if (aberta) {
      setMontada(true)
      setFase('entrando')
      frame.current = requestAnimationFrame(() => setFase('aberta'))
      return
    }
    setFase('fechando')
    timer.current = setTimeout(() => setMontada(false), DURACAO_FECHAMENTO)
  }, [aberta])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [])

  const fechar = useCallback(() => setAberta(false), [])

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

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setAberta(true)
        }}
        aria-label={`Não foi possível ler: ${campo}. Toque para saber o que fazer.`}
        title={`O sistema não conseguiu ler ${campo}`}
        className={
          variante === 'bloco'
            ? 'inline-flex items-center gap-1 rounded-lg border border-devolve-border bg-devolve-bg px-2 py-0.5 text-sm font-bold text-devolve-text transition-colors hover:bg-white'
            : 'mx-[1px] rounded bg-devolve-bg px-[2px] font-bold text-devolve-text underline decoration-devolve-text decoration-dotted underline-offset-2'
        }
      >
        ?
        {variante === 'bloco' && rotulo && (
          <span className="text-[11px] font-medium opacity-80">{rotulo}</span>
        )}
      </button>

      {montada && (
        <Portal>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Não conseguimos ler ${campo}`}
            onClick={fechar}
            className={`t-modal fixed inset-0 z-50 flex items-end justify-center bg-tinta-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4 ${
              fase === 'aberta' ? 'is-open' : fase === 'fechando' ? 'is-closing' : ''
            }`}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-cartaAlta sm:rounded-2xl"
            >
              <p className="text-2xl font-bold text-devolve-text" aria-hidden>
                ?
              </p>
              <h2 className="mt-2 text-lg font-semibold leading-snug text-tinta-900">
                O sistema não conseguiu ler {campo}.
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-tinta-600">
                Amplie a foto do cheque e digite o que você vê. O <strong>?</strong> some assim que
                você salvar.
              </p>

              <div className="mt-5 flex flex-col gap-2">
                {onCorrigir && (
                  <button
                    type="button"
                    onClick={() => {
                      fechar()
                      onCorrigir()
                    }}
                    className="btn-primario w-full"
                  >
                    Corrigir agora
                  </button>
                )}
                {onVerFoto && (
                  <button
                    type="button"
                    onClick={() => {
                      fechar()
                      onVerFoto()
                    }}
                    className="btn-secundario w-full"
                  >
                    Ver a foto
                  </button>
                )}
                <button type="button" onClick={fechar} className="btn-secundario w-full">
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  )
}

/**
 * Texto que pode conter `?` no meio — CMC7, extenso, nominal.
 * Cada `?` vira a marca clicável; o resto aparece normal.
 */
export function TextoComLacunas({
  texto,
  campo,
  onCorrigir,
  onVerFoto,
  className = '',
}: {
  texto: string
  campo: string
  onCorrigir?: () => void
  onVerFoto?: () => void
  className?: string
}) {
  if (!texto.includes('?')) return <span className={className}>{texto}</span>

  return (
    <span className={className}>
      {texto
        .split('')
        .map((caractere, indice) =>
          caractere === '?' ? (
            <NaoLido key={indice} campo={campo} onCorrigir={onCorrigir} onVerFoto={onVerFoto} />
          ) : (
            <span key={indice}>{caractere}</span>
          ),
        )}
    </span>
  )
}
