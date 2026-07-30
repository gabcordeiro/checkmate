import { formatarBRL } from '@/lib/format'
import { alertasDoLote, type ResumoLote } from '@/lib/lote'
import type { ChequeRow } from '@/lib/supabase/types'

/**
 * Resumo no topo do lote: quantos cheques, quanto vale, quantos alertas.
 * Vermelhos primeiro, cada um linkando para a linha do cheque.
 */
export default function PainelAlertas({
  cheques,
  resumo,
}: {
  cheques: ChequeRow[]
  resumo: ResumoLote
}) {
  const alertas = alertasDoLote(cheques)
  const vermelhos = alertas.filter((a) => a.alerta.nivel === 'vermelho')
  const amarelos = alertas.filter((a) => a.alerta.nivel === 'amarelo')

  return (
    <section className="cartao overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-slate-200 px-4 py-3 text-sm">
        <strong className="text-base">{resumo.quantidade} cheques</strong>
        <span className="text-slate-300">·</span>
        <strong className="text-base">{formatarBRL(resumo.total)}</strong>
        <span className="text-slate-300">·</span>
        <span className={resumo.vermelhos ? 'font-medium text-devolve-text' : 'text-slate-500'}>
          {resumo.vermelhos} {resumo.vermelhos === 1 ? 'alerta vermelho' : 'alertas vermelhos'}
        </span>
        <span className="text-slate-300">·</span>
        <span className={resumo.amarelos ? 'font-medium text-conferir-text' : 'text-slate-500'}>
          {resumo.amarelos} {resumo.amarelos === 1 ? 'amarelo' : 'amarelos'}
        </span>
        <span className="ml-auto text-xs text-slate-500">
          {resumo.lancados}/{resumo.quantidade} lançados
        </span>
      </div>

      {alertas.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ok-text">
          Nenhum alerta neste lote. Ainda assim, confira a foto de cada cheque antes de lançar.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {[...vermelhos, ...amarelos].map(({ cheque, alerta }, indice) => (
            <li key={`${cheque.id}-${alerta.codigo}-${indice}`}>
              <a
                href={`#cheque-${cheque.id}`}
                className={`block px-4 py-2.5 text-sm hover:bg-slate-50 ${
                  alerta.nivel === 'vermelho' ? 'border-l-4 border-l-devolve-border' : ''
                }`}
              >
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span aria-hidden>{alerta.nivel === 'vermelho' ? '🔴' : '🟡'}</span>
                  <strong
                    className={
                      alerta.nivel === 'vermelho' ? 'text-devolve-text' : 'text-conferir-text'
                    }
                  >
                    {alerta.titulo}
                  </strong>
                  <span className="text-xs text-slate-500">
                    {cheque.emitente?.trim() || 'emitente não identificado'}
                    {cheque.numero_cheque ? ` · nº ${cheque.numero_cheque}` : ''}
                    {cheque.valor_numerico !== null
                      ? ` · ${formatarBRL(Number(cheque.valor_numerico))}`
                      : ''}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                  {alerta.detalhe}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
