'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renderiza os filhos no fim do <body>.
 *
 * Não é enfeite: `backdrop-filter` num ancestral (o `.cartao` tem
 * `backdrop-blur`) cria um containing block, e a partir daí um
 * `position: fixed` passa a se posicionar em relação ao CARD, não à janela.
 * Resultado: a tela cheia da foto e o modal de explicação abriam presos dentro
 * do cartão, cobrindo só um pedaço da tela. `transform`, `filter` e
 * `will-change` fazem o mesmo — e o app usa os três.
 *
 * Portal tira o overlay dessa árvore e resolve de uma vez.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  const [montado, setMontado] = useState(false)

  // Só depois da hidratação: no servidor não existe document.
  useEffect(() => {
    setMontado(true)
  }, [])

  if (!montado) return null
  return createPortal(children, document.body)
}
