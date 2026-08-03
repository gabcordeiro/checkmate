'use client'

import ExplicacaoAlerta from './ExplicacaoAlerta'
import type { Alerta } from '@/lib/validation/types'

/**
 * Como um alerta aparece na tela, em toda a aplicação.
 *
 * Ele fica curto de propósito — título forte, uma frase de detalhe — e o resto
 * (o que aconteceu, por que custa dinheiro, o que fazer) mora atrás do botão
 * "entender". Quem já sabe não perde tempo lendo; quem não sabe não precisa
 * adivinhar.
 */
export default function ListaAlertas({
  alertas,
  variante = 'linha',
}: {
  alertas: Alerta[]
  /** `linha` = compacto dentro da lista; `cartao` = destacado no modo conferência. */
  variante?: 'linha' | 'cartao'
}) {
  if (alertas.length === 0) return null

  if (variante === 'linha') {
    return (
      <ul className="space-y-1 pt-0.5">
        {alertas.map((alerta, indice) => (
          <li
            key={`${alerta.codigo}-${indice}`}
            className={`text-xs leading-relaxed ${
              alerta.nivel === 'vermelho' ? 'text-devolve-text' : 'text-conferir-text'
            }`}
          >
            <span aria-hidden>{alerta.nivel === 'vermelho' ? '🔴' : '🟡'}</span>{' '}
            <strong>{alerta.titulo}.</strong> {alerta.detalhe}
            <ExplicacaoAlerta alerta={alerta} />
          </li>
        ))}
      </ul>
    )
  }

  const vermelhos = alertas.filter((a) => a.nivel === 'vermelho')
  const amarelos = alertas.filter((a) => a.nivel === 'amarelo')

  return (
    <div className="space-y-2">
      {[
        { lista: vermelhos, classe: 'border-devolve-border bg-devolve-bg text-devolve-text' },
        { lista: amarelos, classe: 'border-conferir-border bg-conferir-bg text-conferir-text' },
      ]
        .filter((g) => g.lista.length > 0)
        .map((grupo) => (
          <ul
            key={grupo.classe}
            className={`space-y-1.5 rounded-xl border px-3 py-2.5 ${grupo.classe}`}
          >
            {grupo.lista.map((alerta, indice) => (
              <li key={`${alerta.codigo}-${indice}`} className="text-xs leading-relaxed">
                <span aria-hidden>{alerta.nivel === 'vermelho' ? '🔴' : '🟡'}</span>{' '}
                <strong>{alerta.titulo}.</strong> {alerta.detalhe}
                <ExplicacaoAlerta alerta={alerta} />
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
