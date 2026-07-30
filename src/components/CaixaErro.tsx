'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Mensagem de erro que sacode ao aparecer (transição "Error state shake" do
 * transitions.dev). Sacode de novo quando a mensagem muda — inclusive quando é
 * o mesmo erro pela segunda vez, que é justamente quando a pessoa não percebeu
 * na primeira.
 */
export default function CaixaErro({
  mensagem,
  tom = 'erro',
  className = '',
}: {
  mensagem: string | null | undefined
  tom?: 'erro' | 'aviso' | 'ok'
  className?: string
}) {
  const [sacudindo, setSacudindo] = useState(false)
  const contador = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!mensagem) return
    contador.current += 1
    setSacudindo(true)
    if (timer.current) clearTimeout(timer.current)
    // 280ms é o total do keyframe (80+60+80+60).
    timer.current = setTimeout(() => setSacudindo(false), 300)
  }, [mensagem])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  if (!mensagem) return null

  const estilo =
    tom === 'ok'
      ? 'border-ok-border bg-ok-bg text-ok-text'
      : tom === 'aviso'
        ? 'border-conferir-border bg-conferir-bg text-conferir-text'
        : 'border-devolve-border bg-devolve-bg text-devolve-text'

  return (
    <p
      role={tom === 'erro' ? 'alert' : 'status'}
      // A key remonta o parágrafo, para o keyframe rodar de novo no mesmo erro.
      key={contador.current}
      className={`rounded-lg border px-3 py-2 text-sm leading-relaxed ${estilo} ${
        tom === 'erro' && sacudindo ? 't-shake' : ''
      } ${className}`}
    >
      {mensagem}
    </p>
  )
}
