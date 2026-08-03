'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Portal from './Portal'
import { explicarAlerta } from '@/lib/explicacoes'
import type { Alerta } from '@/lib/validation/types'

/**
 * Botão "entender" ao lado do alerta, que abre a explicação.
 *
 * Existe porque a operadora leu "Lido 9, calculado 8" e disse "não entendi".
 * O alerta na linha fica curto e direto; quem quiser saber o que está por trás
 * — o que aconteceu, por que custa dinheiro, o que fazer — abre aqui, sem que
 * essa explicação ocupe a tela de quem já sabe.
 */

const DURACAO_FECHAMENTO = 150

const TOM_CLASSE = {
  neutro: 'border-tinta-200 bg-white text-tinta-800',
  ok: 'border-ok-border bg-ok-bg text-ok-text',
  erro: 'border-devolve-border bg-devolve-bg text-devolve-text',
} as const

export default function ExplicacaoAlerta({ alerta }: { alerta: Alerta }) {
  const explicacao = explicarAlerta(alerta)
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

  if (!explicacao) return null

  const vermelho = alerta.nivel === 'vermelho'

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label={`Entender: ${alerta.titulo}`}
        className={`ml-1 inline-flex h-[18px] items-center gap-1 rounded-full border px-1.5 align-middle text-[10px] font-semibold transition-colors ${
          vermelho
            ? 'border-devolve-border bg-white/70 text-devolve-text hover:bg-white'
            : 'border-conferir-border bg-white/70 text-conferir-text hover:bg-white'
        }`}
      >
        <span aria-hidden>?</span> entender
      </button>

      {montada && (
        <Portal>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Explicação: ${alerta.titulo}`}
            onClick={fechar}
            className={`t-modal fixed inset-0 z-50 flex items-end justify-center bg-tinta-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4 ${
              fase === 'aberta' ? 'is-open' : fase === 'fechando' ? 'is-closing' : ''
            }`}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-cartaAlta sm:rounded-2xl"
            >
              {/* Cabeçalho na cor do nível: o modal continua dizendo a gravidade. */}
              <div
                className={`flex items-start gap-2.5 rounded-t-2xl px-5 py-4 ${
                  vermelho ? 'bg-devolve-bg' : 'bg-conferir-bg'
                }`}
              >
                <span aria-hidden className="text-lg leading-none">
                  {vermelho ? '🔴' : '🟡'}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[11px] font-semibold uppercase tracking-wide ${
                      vermelho ? 'text-devolve-text' : 'text-conferir-text'
                    }`}
                  >
                    {vermelho ? 'O banco pode devolver' : 'Confira antes de lançar'}
                  </p>
                  <h2 className="mt-0.5 font-semibold leading-snug text-tinta-900">
                    {alerta.titulo}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={fechar}
                  aria-label="Fechar"
                  className="shrink-0 rounded-lg px-2 py-1 text-sm text-tinta-500 hover:bg-white/60 hover:text-tinta-900"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-5 px-5 py-5">
                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-tinta-400">
                    O que aconteceu
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-tinta-800">{explicacao.oQue}</p>
                </section>

                {explicacao.comparacao && explicacao.comparacao.length > 0 && (
                  <section>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-tinta-400">
                      Neste cheque
                    </h3>
                    <ul className="mt-2 space-y-1.5">
                      {explicacao.comparacao.map((linha) => (
                        <li
                          key={linha.rotulo}
                          className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-xl border px-3 py-2 ${
                            TOM_CLASSE[linha.tom ?? 'neutro']
                          }`}
                        >
                          <span className="text-xs">{linha.rotulo}</span>
                          <span className="font-mono text-sm font-semibold">{linha.valor}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-tinta-400">
                    Por que isso importa
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-tinta-800">
                    {explicacao.porQue}
                  </p>
                </section>

                <section>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-tinta-400">
                    O que fazer
                  </h3>
                  <ol className="mt-2 space-y-2">
                    {explicacao.oQueFazer.map((passo, indice) => (
                      <li
                        key={passo}
                        className="flex gap-2.5 text-sm leading-relaxed text-tinta-800"
                      >
                        <span
                          aria-hidden
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-marca-50 text-[11px] font-semibold text-marca-700"
                        >
                          {indice + 1}
                        </span>
                        {passo}
                      </li>
                    ))}
                  </ol>
                </section>

                {explicacao.exemplo && (
                  <section className="rounded-xl border border-marca-100 bg-marca-50/60 px-4 py-3">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-marca-700">
                      Para ficar claro
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-tinta-700">
                      {explicacao.exemplo}
                    </p>
                  </section>
                )}
              </div>

              <div className="sticky bottom-0 border-t border-tinta-100 bg-white px-5 py-3">
                <button type="button" onClick={fechar} className="btn-primario w-full">
                  Entendi
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  )
}
