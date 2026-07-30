'use client'

import { useState } from 'react'
import { formatarBRL } from '@/lib/format'
import type { Vencimento } from '@/lib/analise'

/**
 * Cronograma de vencimentos do lote — quanto vence em cada mês e quanto disso
 * está em cheque que o banco pode devolver.
 *
 * Forma: coluna empilhada (magnitude ao longo do tempo, part-to-whole no mês).
 * Cor: padrão "emphasis" — o segmento em risco leva o vermelho de status, o
 * resto fica no cinza de recessão. Duas séries, então a legenda está sempre
 * presente e a leitura completa aparece escrita: a identidade nunca depende só
 * da cor.
 *
 * Marcas: coluna com no máximo 24px, topo arredondado em 4px (a ponta do dado),
 * base quadrada na linha de base, 2px de superfície entre os segmentos.
 *
 * O valor cheio fica numa linha de leitura de altura fixa acima do gráfico, e
 * não flutuando sobre a coluna: "R$ 22.300,50" não cabe na largura de uma
 * coluna e colidiria com a vizinha.
 */

const ALTURA_PLOT = 116
/** Acima disso os rótulos diretos viram ruído; a linha de leitura basta. */
const MAX_COLUNAS_ROTULADAS = 12

function alturaEmPx(valor: number, maximo: number): number {
  if (maximo <= 0 || valor <= 0) return 0
  // Piso de 3px para um mês com valor pequeno não desaparecer.
  return Math.max(3, Math.round((valor / maximo) * ALTURA_PLOT))
}

/** "22,3 mil" / "990" — cabe na largura de uma coluna. */
function compacto(valor: number): string {
  if (valor >= 1000) {
    const mil = valor / 1000
    return `${mil.toLocaleString('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: mil >= 100 ? 0 : 1,
    })} mil`
  }
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

export default function Cronograma({ meses }: { meses: Vencimento[] }) {
  const [ativo, setAtivo] = useState<string | null>(null)

  if (meses.length === 0) return null

  const maximo = Math.max(...meses.map((m) => m.total))
  const mesMaior = meses.reduce((a, b) => (b.total > a.total ? b : a), meses[0])
  const temRisco = meses.some((m) => m.risco > 0)
  const totalGeral = meses.reduce((soma, m) => soma + m.total, 0)
  const rotularColunas = meses.length <= MAX_COLUNAS_ROTULADAS

  const emFoco = ativo ? meses.find((m) => m.mes === ativo) : null

  return (
    <section className="cartao px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-semibold">Cronograma de vencimentos</h2>
        <div className="flex items-center gap-3 text-xs text-tinta-500">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full bg-marca-neutro" />
            Sem alerta vermelho
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full bg-marca-risco" />
            Pode ser devolvido
          </span>
        </div>
      </div>

      {/* Linha de leitura: altura fixa para o gráfico não pular ao passar o mouse. */}
      <p className="mt-1 min-h-[1.15rem] text-xs text-tinta-600">
        {emFoco && emFoco.quantidade > 0 ? (
          <>
            <strong className="font-medium">{emFoco.rotulo}</strong> · {formatarBRL(emFoco.total)}{' '}
            em {emFoco.quantidade} {emFoco.quantidade === 1 ? 'cheque' : 'cheques'}
            {emFoco.risco > 0 && (
              <span className="text-devolve-text"> · {formatarBRL(emFoco.risco)} em risco</span>
            )}
          </>
        ) : emFoco ? (
          <>
            <strong className="font-medium">{emFoco.rotulo}</strong> · nenhum cheque neste mês
          </>
        ) : mesMaior.total > 0 ? (
          <>
            Mês mais pesado: <strong className="font-medium">{mesMaior.rotulo}</strong> ·{' '}
            {formatarBRL(mesMaior.total)}
          </>
        ) : null}
      </p>

      <div className="mt-2 overflow-x-auto">
        <div
          className="flex items-end gap-1.5"
          style={{ height: ALTURA_PLOT + 30, minWidth: meses.length * 38 }}
        >
          {meses.map((mes) => {
            const alturaTotal = alturaEmPx(mes.total, maximo)
            const alturaRisco = mes.risco > 0 ? alturaEmPx(mes.risco, maximo) : 0
            const alturaResto = Math.max(0, alturaTotal - alturaRisco)
            const selecionado = ativo === mes.mes

            return (
              <div key={mes.mes} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <button
                  type="button"
                  onMouseEnter={() => setAtivo(mes.mes)}
                  onMouseLeave={() => setAtivo((atual) => (atual === mes.mes ? null : atual))}
                  onFocus={() => setAtivo(mes.mes)}
                  onBlur={() => setAtivo((atual) => (atual === mes.mes ? null : atual))}
                  aria-label={`${mes.rotulo}: ${formatarBRL(mes.total)} em ${mes.quantidade} cheque(s)${
                    mes.risco > 0 ? `, ${formatarBRL(mes.risco)} pode ser devolvido` : ''
                  }`}
                  // Alvo de interação maior que a marca: a coluna toda responde.
                  className={`flex w-full flex-1 cursor-default flex-col justify-end gap-1 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-tinta-400 ${
                    selecionado ? 'bg-tinta-50' : ''
                  }`}
                >
                  <span
                    className={`block h-3.5 truncate text-center text-[10px] tabular-nums ${
                      selecionado ? 'text-tinta-900' : 'text-tinta-500'
                    }`}
                  >
                    {rotularColunas && mes.total > 0 ? compacto(mes.total) : ''}
                  </span>

                  {mes.total === 0 ? (
                    <span aria-hidden className="mx-auto h-[3px] w-6 rounded-sm bg-tinta-100" />
                  ) : (
                    <span aria-hidden className="mx-auto flex w-6 max-w-full flex-col justify-end">
                      {alturaRisco > 0 && (
                        <span
                          className="w-full rounded-t bg-marca-risco"
                          style={{
                            height: alturaRisco,
                            // 2px de superfície separando os segmentos.
                            marginBottom: alturaResto > 0 ? 2 : 0,
                          }}
                        />
                      )}
                      {alturaResto > 0 && (
                        <span
                          className={`w-full bg-marca-neutro ${alturaRisco > 0 ? '' : 'rounded-t'}`}
                          style={{ height: alturaResto }}
                        />
                      )}
                    </span>
                  )}
                </button>

                {/* Linha de base: hairline, sólida, recessiva. */}
                <span aria-hidden className="h-px w-full bg-tinta-200" />
                <span
                  className={`w-full truncate text-center text-[10px] tabular-nums ${
                    mes.total > 0 ? 'text-tinta-600' : 'text-tinta-300'
                  }`}
                >
                  {mes.rotulo}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] text-tinta-500 hover:text-tinta-900">
          Ver como tabela
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-tinta-500">
            <tr>
              <th className="py-1 font-medium">Mês</th>
              <th className="py-1 text-right font-medium">Cheques</th>
              <th className="py-1 text-right font-medium">Total</th>
              {temRisco && <th className="py-1 text-right font-medium">Em risco</th>}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {meses
              .filter((m) => m.quantidade > 0)
              .map((mes) => (
                <tr key={mes.mes} className="border-t border-tinta-100">
                  <td className="py-1">{mes.rotulo}</td>
                  <td className="py-1 text-right">{mes.quantidade}</td>
                  <td className="py-1 text-right">{formatarBRL(mes.total)}</td>
                  {temRisco && (
                    <td className="py-1 text-right">
                      {mes.risco > 0 ? formatarBRL(mes.risco) : '—'}
                    </td>
                  )}
                </tr>
              ))}
            <tr className="border-t border-tinta-200 font-medium">
              <td className="py-1">Total</td>
              <td className="py-1 text-right">
                {meses.reduce((soma, m) => soma + m.quantidade, 0)}
              </td>
              <td className="py-1 text-right">{formatarBRL(totalGeral)}</td>
              {temRisco && (
                <td className="py-1 text-right">
                  {formatarBRL(meses.reduce((soma, m) => soma + m.risco, 0))}
                </td>
              )}
            </tr>
          </tbody>
        </table>
      </details>
    </section>
  )
}
