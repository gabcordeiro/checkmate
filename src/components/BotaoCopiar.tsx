'use client'

import { useEffect, useRef, useState } from 'react'
import { copiarTexto } from '@/lib/clipboard'

/**
 * Um clique → clipboard, com feedback visual. É a interação mais usada do app:
 * a operadora copia o CMC7 daqui e cola no sistema da empresa.
 */
export default function BotaoCopiar({
  texto,
  rotulo = 'Copiar',
  className = '',
}: {
  texto: string
  rotulo?: string
  className?: string
}) {
  const [estado, setEstado] = useState<'pronto' | 'copiado' | 'erro'>('pronto')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  async function copiar() {
    setEstado((await copiarTexto(texto)) ? 'copiado' : 'erro')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setEstado('pronto'), 1600)
  }

  return (
    <button
      type="button"
      onClick={copiar}
      aria-live="polite"
      className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
        estado === 'copiado'
          ? 'border-ok-border bg-ok-bg text-ok-text'
          : estado === 'erro'
            ? 'border-devolve-border bg-devolve-bg text-devolve-text'
            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
      } ${className}`}
    >
      {estado === 'copiado' ? 'Copiado ✓' : estado === 'erro' ? 'Falhou' : rotulo}
    </button>
  )
}
