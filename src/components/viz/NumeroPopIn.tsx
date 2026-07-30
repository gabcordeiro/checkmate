'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Valor que entra caractere por caractere, com blur e stagger (transição
 * "Number pop-in" do transitions.dev).
 *
 * Usado só no número que mais importa do lote — quanto pode voltar do banco.
 * Anima na primeira renderização e quando o valor muda (depois de uma correção
 * manual, por exemplo), nunca a cada re-render.
 */
export default function NumeroPopIn({
  valor,
  className = '',
}: {
  valor: string
  className?: string
}) {
  const [animando, setAnimando] = useState(true)
  const anterior = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (anterior.current === valor) return
    const primeiraVez = anterior.current === null
    anterior.current = valor

    setAnimando(false)
    // Um frame sem a classe para o keyframe poder recomeçar no valor novo.
    const frame = requestAnimationFrame(() => setAnimando(true))

    if (timer.current) clearTimeout(timer.current)
    // Solta o will-change depois do fim (500ms + stagger máximo).
    timer.current = setTimeout(() => setAnimando(false), primeiraVez ? 1400 : 1400)

    return () => cancelAnimationFrame(frame)
  }, [valor])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const caracteres = [...valor]

  return (
    <span className={`t-digit-group ${animando ? 'is-animating' : ''} ${className}`}>
      {caracteres.map((caractere, indice) => (
        <span
          key={`${indice}-${caractere}`}
          className="t-digit"
          // Stagger crescente da esquerda para a direita, limitado para um
          // valor longo não levar meio segundo a mais para aparecer.
          style={{ animationDelay: `calc(var(--digit-stagger) * ${Math.min(indice, 6) / 2})` }}
        >
          {caractere === ' ' ? ' ' : caractere}
        </span>
      ))}
    </span>
  )
}
