'use client'

import { useEffect, useRef, useState } from 'react'
import { copiarTexto } from '@/lib/clipboard'
import { useTrocaDeTexto } from '@/hooks/useTrocaDeTexto'

/**
 * Um clique → clipboard, com feedback visual. É a interação mais usada do app:
 * a operadora copia o CMC7 daqui e cola no sistema da empresa.
 *
 * O rótulo troca com a transição "Text states swap" — o texto antigo sai para
 * cima com blur e o novo entra por baixo. Numa ação repetida dezenas de vezes
 * por lote, a animação é o que confirma que o clique pegou.
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

  const alvo = estado === 'copiado' ? 'Copiado ✓' : estado === 'erro' ? 'Falhou' : rotulo
  const { texto: rotuloVisivel, classe } = useTrocaDeTexto(alvo)

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
      className={`overflow-hidden rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
        estado === 'copiado'
          ? 'border-ok-border bg-ok-bg text-ok-text'
          : estado === 'erro'
            ? 'border-devolve-border bg-devolve-bg text-devolve-text'
            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
      } ${className}`}
    >
      <span className={classe}>{rotuloVisivel}</span>
    </button>
  )
}
