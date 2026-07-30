'use client'

import BotaoCopiar from './BotaoCopiar'
import CheckLancado from './CheckLancado'
import Cmc7 from './Cmc7'
import FotoCheque from './FotoCheque'
import StatusBadge from './StatusBadge'
import { formatarBRL } from '@/lib/format'
import { formatarDataBr } from '@/lib/validation/datas'
import type { ChequeComFoto } from './TabelaLote'

/**
 * Uma linha do lote. Tudo que a operadora precisa DIGITAR no sistema da empresa
 * tem botão de copiar próprio (CMC7, valor, data) mais um "copiar linha" que sai
 * separado por tabulação, para colar direto numa planilha.
 */

/** Valor no formato que se digita no sistema: 1842,50 (sem "R$"). */
export function valorParaDigitar(cheque: ChequeComFoto): string {
  if (cheque.valor_numerico === null) return ''
  return Number(cheque.valor_numerico).toFixed(2).replace('.', ',')
}

export function linhaTabulada(cheque: ChequeComFoto): string {
  return [
    cheque.emitente ?? '',
    cheque.numero_cheque ?? '',
    formatarDataBr(cheque.data_efetiva ?? cheque.data_emissao),
    valorParaDigitar(cheque),
    cheque.cmc7_completo ?? '',
  ].join('\t')
}

export default function LinhaCheque({
  cheque,
  onAlternarLancado,
  onEditar,
  salvando = false,
  compacta = false,
}: {
  cheque: ChequeComFoto
  onAlternarLancado: (proximo: boolean) => void
  onEditar: () => void
  salvando?: boolean
  compacta?: boolean
}) {
  const dataEfetiva = formatarDataBr(cheque.data_efetiva ?? cheque.data_emissao)
  const valor = valorParaDigitar(cheque)

  return (
    /**
     * No celular a linha empilha: foto e status/checkbox dividem a primeira
     * faixa, e o conteúdo ocupa a largura inteira embaixo. Sem isso a coluna do
     * meio é esmagada e o texto quebra uma palavra por linha.
     */
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <FotoCheque
        url={cheque.urlAssinada}
        legenda={cheque.numero_cheque ?? cheque.id.slice(0, 8)}
      />

      <div className="ml-auto flex shrink-0 items-center gap-3 sm:order-last sm:ml-0 sm:flex-col sm:items-end sm:gap-2">
        <StatusBadge status={cheque.status} />
        <CheckLancado
          marcado={cheque.lancado}
          desabilitado={salvando}
          onAlternar={onAlternarLancado}
        />
      </div>

      <div className="w-full min-w-0 space-y-1.5 sm:order-2 sm:w-auto sm:flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          {compacta && (
            <span className="font-medium uppercase tracking-wide text-tinta-500">
              {cheque.emitente?.trim() || 'sem emitente'}
            </span>
          )}
          <span className="font-medium tabular-nums">nº {cheque.numero_cheque ?? '—'}</span>
          <span className="tabular-nums text-tinta-600">
            {dataEfetiva}
            {cheque.bom_para && cheque.bom_para !== cheque.data_emissao && (
              <span className="text-xs text-tinta-400">
                {' '}
                (bom p/ {formatarDataBr(cheque.bom_para)} · cheque{' '}
                {formatarDataBr(cheque.data_emissao)})
              </span>
            )}
          </span>
          <span className="font-semibold tabular-nums">
            {formatarBRL(cheque.valor_numerico === null ? null : Number(cheque.valor_numerico))}
          </span>
          <span className="text-xs text-tinta-500">
            {cheque.banco_nome || cheque.banco_codigo || '—'}
            {cheque.agencia ? ` · ag ${cheque.agencia}` : ''}
            {cheque.conta ? ` · cc ${cheque.conta}` : ''}
          </span>
          {cheque.revisado_manualmente && (
            <span className="rounded-full bg-tinta-100 px-1.5 py-0.5 text-[10px] font-medium text-tinta-600">
              revisado por você
            </span>
          )}
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
                  alerta.nivel === 'vermelho' ? 'text-devolve-text' : 'text-conferir-text'
                }`}
              >
                <span aria-hidden>{alerta.nivel === 'vermelho' ? '🔴' : '🟡'}</span>{' '}
                <strong>{alerta.titulo}.</strong> {alerta.detalhe}
              </li>
            ))}
          </ul>
        )}

        {cheque.valor_extenso_texto && (
          <p className="text-xs italic text-tinta-500">
            Extenso lido: “{cheque.valor_extenso_texto}”
            {cheque.valor_extenso_convertido !== null && (
              <> → {formatarBRL(Number(cheque.valor_extenso_convertido))}</>
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {valor && <BotaoCopiar texto={valor} rotulo={`Copiar ${valor}`} />}
          {dataEfetiva !== '—' && <BotaoCopiar texto={dataEfetiva} rotulo={`Copiar ${dataEfetiva}`} />}
          <BotaoCopiar texto={linhaTabulada(cheque)} rotulo="Copiar linha" />
          <button
            type="button"
            onClick={onEditar}
            className="rounded-md border border-tinta-300 bg-white px-2 py-1 text-xs font-medium text-tinta-600 hover:bg-tinta-100"
          >
            Corrigir
          </button>
        </div>
      </div>
    </div>
  )
}
