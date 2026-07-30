'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Troca de texto em três fases (transição "Text states swap" do transitions.dev):
 *   1. `is-exit` — o texto antigo sai para cima com blur
 *   2. troca o conteúdo e pula para baixo sem transição (`is-enter-start`)
 *   3. solta — o texto novo sobe até o lugar
 *
 * Em React a terceira fase precisa de um frame de intervalo, não de um reflow
 * forçado: o browser tem de pintar o estado `is-enter-start` antes de a classe
 * sair, senão não há transição nenhuma.
 */
export function useTrocaDeTexto(valor: string, duracaoMs = 150) {
  const [visivel, setVisivel] = useState(valor)
  const [fase, setFase] = useState<'parado' | 'saindo' | 'entrando'>('parado')
  const anterior = useRef(valor)
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([])
  const frames = useRef<number[]>([])

  useEffect(() => {
    if (valor === anterior.current) return
    anterior.current = valor

    setFase('saindo')
    const t = setTimeout(() => {
      setVisivel(valor)
      setFase('entrando')
      // Um frame para o estado "abaixo, sem transição" ser pintado…
      const f1 = requestAnimationFrame(() => {
        // …e só então liberar, para a subida ser animada.
        const f2 = requestAnimationFrame(() => setFase('parado'))
        frames.current.push(f2)
      })
      frames.current.push(f1)
    }, duracaoMs)
    timers.current.push(t)
  }, [valor, duracaoMs])

  useEffect(() => {
    return () => {
      for (const t of timers.current) clearTimeout(t)
      for (const f of frames.current) cancelAnimationFrame(f)
    }
  }, [])

  const classe =
    fase === 'saindo' ? 't-text-swap is-exit' : fase === 'entrando' ? 't-text-swap is-enter-start' : 't-text-swap'

  return { texto: visivel, classe }
}
