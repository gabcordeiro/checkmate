'use client'

import { useMemo, useState } from 'react'
import Cmc7 from './Cmc7'
import MiniaturaCheque from './MiniaturaCheque'
import StatusBadge from './StatusBadge'
import { formatarBRL } from '@/lib/format'
import { agruparPorEmitente } from '@/lib/lote'
import { formatarDataBr } from '@/lib/validation/datas'
import type { ChequeRow } from '@/lib/supabase/types'

export interface ChequeComFoto extends ChequeRow {
  urlAssinada: string | null
}

export default function TabelaLote({ cheques }: { cheques: ChequeComFoto[] }) {
  // `lancado` é o único campo que a tela escreve. Guardamos o override local
  // para o checkbox responder na hora, sem esperar o round-trip.
  const [lancados, setLancados] = useState<Record<string, boolean>>({})
  const [salvando, setSalvando] = useState<Record<string, boolean>>({})
  const [erro, setErro] = useState<string | null>(null)

  const grupos = useMemo(() => agruparPorEmitente(cheques), [cheques])
  const porId = useMemo(
    () => new Map(cheques.map((c) => [c.id, c])),
    [cheques],
  )

  function estaLancado(cheque: ChequeRow) {
    return lancados[cheque.id] ?? cheque.lancado
  }

  async function alternarLancado(id: string, proximo: boolean) {
    setErro(null)
    setLancados((atual) => ({ ...atual, [id]: proximo }))
    setSalvando((atual) => ({ ...atual, [id]: true }))
    try {
      const resposta = await fetch(`/api/cheques/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lancado: proximo }),
      })
      if (!resposta.ok) throw new Error('falha ao salvar')
    } catch {
      // Volta ao valor real: marcar como lançado sem persistir seria pior que
      // não marcar — a operadora perderia o controle do progresso.
      const original = porId.get(id)?.lancado ?? false
      setLancados((atual) => ({ ...atual, [id]: original }))
      setErro('Não foi possível salvar o "lançado". Verifique a conexão e tente de novo.')
    } finally {
      setSalvando((atual) => ({ ...atual, [id]: false }))
    }
  }

  if (cheques.length === 0) {
    return (
      <p className="cartao px-4 py-6 text-sm text-slate-600">
        Nenhum cheque neste lote ainda. Envie as fotos para o app extrair.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {erro && (
        <p className="rounded-lg border border-devolve-border bg-devolve-bg px-3 py-2 text-sm text-devolve-text">
          {erro}
        </p>
      )}

      {grupos.map((grupo) => (
        <section key={grupo.chave} className="cartao overflow-hidden">
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <h2 className="text-sm font-semibold uppercase tracking-wide">{grupo.rotulo}</h2>
            <span className="text-xs text-slate-500">
              {grupo.cheques.length} {grupo.cheques.length === 1 ? 'cheque' : 'cheques'}
            </span>
            {grupo.vermelhos > 0 && (
              <span className="text-xs font-medium text-devolve-text">
                {grupo.vermelhos} {grupo.vermelhos === 1 ? 'vermelho' : 'vermelhos'}
              </span>
            )}
            <span className="ml-auto text-sm font-semibold">{formatarBRL(grupo.subtotal)}</span>
          </header>

          <ul className="divide-y divide-slate-100">
            {grupo.cheques.map((cheque) => (
              <li
                key={cheque.id}
                id={`cheque-${cheque.id}`}
                className={`scroll-mt-20 px-4 py-3 ${
                  cheque.status === 'vermelho'
                    ? 'border-l-4 border-l-devolve-border bg-devolve-bg/40'
                    : cheque.status === 'conferir'
                      ? 'border-l-4 border-l-conferir-border'
                      : ''
                } ${estaLancado(cheque) ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
                  <MiniaturaCheque
                    url={cheque.urlAssinada}
                    legenda={cheque.numero_cheque ?? cheque.id.slice(0, 8)}
                  />

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                      <span className="font-medium">
                        nº {cheque.numero_cheque ?? '—'}
                      </span>
                      <span className="text-slate-600">
                        {formatarDataBr(cheque.data_efetiva ?? cheque.data_emissao)}
                        {cheque.bom_para && cheque.bom_para !== cheque.data_emissao && (
                          <span className="text-xs text-slate-400">
                            {' '}
                            (bom p/ {formatarDataBr(cheque.bom_para)} · cheque{' '}
                            {formatarDataBr(cheque.data_emissao)})
                          </span>
                        )}
                      </span>
                      <span className="font-semibold">
                        {formatarBRL(
                          cheque.valor_numerico === null ? null : Number(cheque.valor_numerico),
                        )}
                      </span>
                      <span className="text-xs text-slate-500">
                        {cheque.banco_nome || cheque.banco_codigo || '—'}
                        {cheque.agencia ? ` · ag ${cheque.agencia}` : ''}
                        {cheque.conta ? ` · cc ${cheque.conta}` : ''}
                      </span>
                    </div>

                    <Cmc7
                      bloco1={cheque.cmc7_bloco1}
                      bloco2={cheque.cmc7_bloco2}
                      bloco3={cheque.cmc7_bloco3}
                      duvidosos={cheque.digitos_duvidosos ?? []}
                      sugestoes={cheque.cmc7_sugestoes ?? []}
                    />

                    {(cheque.alertas ?? []).length > 0 && (
                      <ul className="space-y-0.5 pt-0.5">
                        {cheque.alertas.map((alerta, indice) => (
                          <li
                            key={`${alerta.codigo}-${indice}`}
                            className={`text-xs leading-relaxed ${
                              alerta.nivel === 'vermelho'
                                ? 'text-devolve-text'
                                : 'text-conferir-text'
                            }`}
                          >
                            <span aria-hidden>
                              {alerta.nivel === 'vermelho' ? '🔴' : '🟡'}
                            </span>{' '}
                            <strong>{alerta.titulo}.</strong> {alerta.detalhe}
                          </li>
                        ))}
                      </ul>
                    )}

                    {cheque.valor_extenso_texto && (
                      <p className="text-xs italic text-slate-500">
                        Extenso lido: “{cheque.valor_extenso_texto}”
                        {cheque.valor_extenso_convertido !== null && (
                          <> → {formatarBRL(Number(cheque.valor_extenso_convertido))}</>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <StatusBadge status={cheque.status} />
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={estaLancado(cheque)}
                        disabled={salvando[cheque.id]}
                        onChange={(evento) => alternarLancado(cheque.id, evento.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      lançado
                    </label>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
