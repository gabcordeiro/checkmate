'use client'

import BotaoCopiar from './BotaoCopiar'
import type { DigitoDuvidoso, SugestaoCmc7 } from '@/lib/validation/types'

interface Props {
  bloco1: string | null
  bloco2: string | null
  bloco3: string | null
  duvidosos: DigitoDuvidoso[]
  sugestoes: SugestaoCmc7[]
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
}: {
  numero: NumeroBloco
  valor: string | null
  duvidosos: DigitoDuvidoso[]
  sugestoes: SugestaoCmc7[]
}) {
  if (!valor) {
    return (
      <span className="rounded bg-tinta-100 px-1.5 py-0.5 text-xs text-tinta-400">
        bloco {numero} ilegível
      </span>
    )
  }

  const doBloco = duvidosos.filter((d) => d.bloco === numero)

  return (
    <span className="font-mono text-[13px] tracking-tight">
      {valor.split('').map((digito, indice) => {
        const posicao = indice + 1
        const duvidoso = doBloco.find((d) => d.posicao === posicao)
        if (!duvidoso) return <span key={posicao}>{digito}</span>

        const sugestao = sugestoes.find((s) => s.bloco === numero && s.posicao === posicao)
        const dica = sugestao
          ? sugestao.descartados.length
            ? `Provavelmente ${sugestao.digito} — com ${sugestao.descartados.join(
                '/',
              )} o verificador não bate.`
            : `Verificador fecha com ${sugestao.digito}.`
          : `Leitura duvidosa: ${duvidoso.alternativas.join(' ou ')}. O verificador não decide.`

        return (
          <span
            key={posicao}
            title={dica}
            aria-label={dica}
            className={
              sugestao
                ? 'cursor-help rounded bg-ok-bg px-[1px] font-bold text-ok-text underline decoration-dotted'
                : 'cursor-help rounded bg-conferir-bg px-[1px] font-bold text-conferir-text underline decoration-dotted'
            }
          >
            {sugestao ? sugestao.digito : digito}
          </span>
        )
      })}
    </span>
  )
}

export default function Cmc7({ bloco1, bloco2, bloco3, duvidosos, sugestoes }: Props) {
  const blocos: Array<{ numero: NumeroBloco; valor: string | null }> = [
    { numero: 1, valor: bloco1 },
    { numero: 2, valor: bloco2 },
    { numero: 3, valor: bloco3 },
  ]

  // O que a operadora vai digitar: os 30 dígitos, já com as correções que o
  // dígito verificador confirmou (destacadas em verde na tela).
  const paraCopiar = blocos
    .map(({ numero, valor }) => aplicarSugestoes(valor, numero, sugestoes) ?? '')
    .join('')

  const completo = blocos.every((b) => b.valor)

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="flex flex-wrap items-center gap-x-1.5">
        {blocos.map(({ numero, valor }, indice) => (
          <span key={numero} className="flex items-center gap-1.5">
            <Bloco
              numero={numero}
              valor={aplicarSugestoes(valor, numero, sugestoes)}
              duvidosos={duvidosos}
              sugestoes={sugestoes}
            />
            {indice < blocos.length - 1 && <span className="text-tinta-300">·</span>}
          </span>
        ))}
      </span>

      {completo && <BotaoCopiar texto={paraCopiar} rotulo="Copiar CMC7" />}

      {sugestoes.length > 0 && (
        <span className="text-[11px] text-ok-text">
          {sugestoes.length === 1
            ? '1 dígito corrigido pelo verificador'
            : `${sugestoes.length} dígitos corrigidos pelo verificador`}
        </span>
      )}
    </div>
  )
}
