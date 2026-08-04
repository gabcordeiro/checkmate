'use client'

import BotaoCopiar from './BotaoCopiar'
import NaoLido from './NaoLido'
import { ILEGIVEL } from '@/lib/validation/cmc7'
import type { DigitoDuvidoso, SugestaoCmc7 } from '@/lib/validation/types'

interface Props {
  bloco1: string | null
  bloco2: string | null
  bloco3: string | null
  duvidosos: DigitoDuvidoso[]
  sugestoes: SugestaoCmc7[]
  onCorrigir?: () => void
  onVerFoto?: () => void
  /**
   * Esconde o botão de copiar daqui — para telas que já têm o seu, com atalho
   * de teclado. Sem isso o mesmo botão aparece duas vezes na conferência.
   */
  semCopiar?: boolean
}

type NumeroBloco = 1 | 2 | 3

function aplicarSugestoes(
  bloco: string | null,
  numero: NumeroBloco,
  sugestoes: SugestaoCmc7[],
): string | null {
  if (!bloco) return bloco
  let saida = bloco
  for (const sugestao of sugestoes.filter((s) => s.bloco === numero)) {
    if (sugestao.posicao >= 1 && sugestao.posicao <= saida.length) {
      saida =
        saida.slice(0, sugestao.posicao - 1) + sugestao.digito + saida.slice(sugestao.posicao)
    }
  }
  return saida
}

function Bloco({
  numero,
  valor,
  duvidosos,
  sugestoes,
  onCorrigir,
  onVerFoto,
}: {
  numero: NumeroBloco
  valor: string | null
  duvidosos: DigitoDuvidoso[]
  sugestoes: SugestaoCmc7[]
  onCorrigir?: () => void
  onVerFoto?: () => void
}) {
  if (!valor) {
    return (
      <span className="rounded bg-tinta-100 px-1.5 py-0.5 text-xs text-tinta-400">
        grupo {numero} não saiu na foto
      </span>
    )
  }

  const doBloco = duvidosos.filter((d) => d.bloco === numero)

  return (
    <span className="font-mono text-[13px] tracking-tight">
      {valor.split('').map((caractere, indice) => {
        const posicao = indice + 1

        // "Não consegui ler" — o pedido da operadora: mostra o que leu e marca
        // o resto com `?` vermelho, em vez de um alerta explicando a conta.
        if (caractere === ILEGIVEL) {
          return (
            <NaoLido
              key={posicao}
              campo="este número do CMC7"
              onCorrigir={onCorrigir}
              onVerFoto={onVerFoto}
            />
          )
        }

        const duvidoso = doBloco.find((d) => d.posicao === posicao)
        if (!duvidoso) return <span key={posicao}>{caractere}</span>

        // "Li, mas pode ser outro" — quando a conferência interna resolve, o
        // dígito certo já está aplicado e fica verde; quando não resolve, fica
        // amarelo para ela olhar na foto.
        const sugestao = sugestoes.find((s) => s.bloco === numero && s.posicao === posicao)
        const dica = sugestao
          ? `Corrigido para ${sugestao.digito}.`
          : `Pode ser ${duvidoso.alternativas.join(' ou ')}. Confira na foto.`

        return (
          <span
            key={posicao}
            title={dica}
            aria-label={dica}
            className={
              sugestao
                ? 'cursor-help rounded bg-ok-bg px-[1px] font-bold text-ok-text'
                : 'cursor-help rounded bg-conferir-bg px-[1px] font-bold text-conferir-text underline decoration-dotted'
            }
          >
            {sugestao ? sugestao.digito : caractere}
          </span>
        )
      })}
    </span>
  )
}

export default function Cmc7({
  bloco1,
  bloco2,
  bloco3,
  duvidosos,
  sugestoes,
  onCorrigir,
  onVerFoto,
  semCopiar = false,
}: Props) {
  const blocos: Array<{ numero: NumeroBloco; valor: string | null }> = [
    { numero: 1, valor: bloco1 },
    { numero: 2, valor: bloco2 },
    { numero: 3, valor: bloco3 },
  ]

  const corrigidos = blocos.map(({ numero, valor }) => aplicarSugestoes(valor, numero, sugestoes))
  const completo = corrigidos.every((b) => b)
  const paraCopiar = corrigidos.join('')
  // CMC7 com lacuna não pode ir para o clipboard: colado no sistema da empresa,
  // um "?" no meio dos 30 dígitos é pior que não copiar nada.
  const temLacuna = paraCopiar.includes(ILEGIVEL)

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="flex flex-wrap items-center gap-x-1.5">
        {blocos.map(({ numero }, indice) => (
          <span key={numero} className="flex items-center gap-1.5">
            <Bloco
              numero={numero}
              valor={corrigidos[indice]}
              duvidosos={duvidosos}
              sugestoes={sugestoes}
              onCorrigir={onCorrigir}
              onVerFoto={onVerFoto}
            />
            {indice < blocos.length - 1 && <span className="text-tinta-300">·</span>}
          </span>
        ))}
      </span>

      {!semCopiar && completo && !temLacuna && (
        <BotaoCopiar texto={paraCopiar} rotulo="Copiar CMC7" />
      )}

      {!semCopiar && completo && temLacuna && (
        <button
          type="button"
          onClick={onCorrigir}
          className="rounded-md border border-devolve-border bg-devolve-bg px-2 py-1 text-xs font-medium text-devolve-text hover:bg-white"
        >
          Complete os ? para copiar
        </button>
      )}

      {sugestoes.length > 0 && (
        <span className="text-[11px] text-ok-text">
          {sugestoes.length === 1
            ? '1 número corrigido'
            : `${sugestoes.length} números corrigidos`}
        </span>
      )}
    </div>
  )
}
