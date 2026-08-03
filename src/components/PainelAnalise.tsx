import { formatarBRL } from '@/lib/format'
import { rotuloDoMes, type AnaliseLote } from '@/lib/analise'
import ExplicacaoAlerta from './ExplicacaoAlerta'
import StatTile from './viz/StatTile'
import Cronograma from './viz/Cronograma'

/**
 * O topo da tela do lote responde quatro perguntas, nesta ordem de importância
 * para a operadora:
 *
 *   1. Quanto desse lote pode voltar do banco?  (o número que custa dinheiro)
 *   2. Quando esses cheques vencem?
 *   3. Qual problema está se repetindo?
 *   4. Quanto do trabalho já foi lançado?
 */

function porcentagem(parte: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((parte / total) * 100)
}

/** Barra de progresso do lançamento: uma razão contra um limite. */
function Medidor({ feitos, total }: { feitos: number; total: number }) {
  const pct = porcentagem(feitos, total)
  const completo = total > 0 && feitos === total

  return (
    <div className="cartao px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-tinta-500">Lançados no sistema</span>
        <span className="text-xs tabular-nums text-tinta-500">{pct}%</span>
      </div>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">
        {feitos}
        <span className="text-tinta-400"> / {total}</span>
      </p>
      <div
        role="progressbar"
        aria-valuenow={feitos}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Cheques lançados no sistema"
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-tinta-200"
      >
        <span
          className={`block h-full rounded-full transition-all ${
            completo ? 'bg-ok-text' : 'bg-marca-gradiente'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-tinta-500">
        {completo
          ? 'Lote inteiro lançado.'
          : `Faltam ${total - feitos} ${total - feitos === 1 ? 'cheque' : 'cheques'}.`}
      </p>
    </div>
  )
}

export default function PainelAnalise({ analise }: { analise: AnaliseLote }) {
  const { resumo, emRisco, aConferir, semData, cronograma, alertasPorTipo } = analise

  const janela =
    analise.primeiroVencimento && analise.ultimoVencimento
      ? analise.primeiroVencimento === analise.ultimoVencimento
        ? rotuloDoMes(analise.primeiroVencimento)
        : `${rotuloDoMes(analise.primeiroVencimento)} → ${rotuloDoMes(analise.ultimoVencimento)}`
      : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          rotulo="Pode ser devolvido"
          valor={formatarBRL(emRisco.valor)}
          apoio={
            emRisco.cheques === 0
              ? 'Nenhum cheque com alerta vermelho.'
              : `${emRisco.cheques} ${emRisco.cheques === 1 ? 'cheque' : 'cheques'} · ${porcentagem(
                  emRisco.valor,
                  resumo.total,
                )}% do lote`
          }
          tom={emRisco.cheques > 0 ? 'critico' : 'bom'}
          icone={emRisco.cheques > 0 ? '🔴' : '🟢'}
          destaque
          // No celular ocupa a faixa inteira: é o número mais importante da
          // tela e, meio a meio, "R$ 15.232,90" quebra em duas linhas.
          className="col-span-2 lg:col-span-1"
          animarValor
        />
        <StatTile
          rotulo="Total do lote"
          valor={formatarBRL(resumo.total)}
          apoio={`${resumo.quantidade} ${
            resumo.quantidade === 1 ? 'cheque' : 'cheques'
          } · ${analise.emitentes} ${analise.emitentes === 1 ? 'emitente' : 'emitentes'}`}
        />
        <StatTile
          rotulo="A conferir"
          valor={String(aConferir.cheques)}
          apoio={
            aConferir.cheques === 0
              ? 'Nada pendente de conferência.'
              : `${formatarBRL(aConferir.valor)} com leitura suspeita`
          }
          tom={aConferir.cheques > 0 ? 'atencao' : 'bom'}
          icone={aConferir.cheques > 0 ? '🟡' : '🟢'}
        />
        <Medidor feitos={resumo.lancados} total={resumo.quantidade} />
      </div>

      {janela && (
        <p className="text-xs text-tinta-500">
          Vencimentos de <strong className="font-medium text-tinta-700">{janela}</strong>
          {semData.cheques > 0 && (
            <>
              {' · '}
              <span className="text-devolve-text">
                {semData.cheques} sem data legível ({formatarBRL(semData.valor)}) fora do
                cronograma
              </span>
            </>
          )}
        </p>
      )}

      <Cronograma meses={cronograma} />

      <section className="cartao-destaque">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-tinta-100 px-4 py-3">
          <h2 className="text-sm font-semibold">O que apareceu neste lote</h2>
          <span className="text-xs text-tinta-500">
            {resumo.vermelhos} {resumo.vermelhos === 1 ? 'alerta vermelho' : 'alertas vermelhos'} ·{' '}
            {resumo.amarelos} {resumo.amarelos === 1 ? 'amarelo' : 'amarelos'}
          </span>
        </header>

        {alertasPorTipo.length === 0 ? (
          <p className="px-4 py-3 text-sm text-ok-text">
            Nenhum alerta. Ainda assim, confira a foto de cada cheque antes de lançar.
          </p>
        ) : (
          <ul className="divide-y divide-tinta-100">
            {alertasPorTipo.map((grupo) => (
              <li key={grupo.codigo}>
                <details className="group">
                  <summary
                    className={`flex cursor-pointer flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-2.5 text-sm hover:bg-tinta-50 ${
                      grupo.nivel === 'vermelho' ? 'border-l-[3px] border-l-marca-risco' : ''
                    }`}
                  >
                    <span aria-hidden>{grupo.nivel === 'vermelho' ? '🔴' : '🟡'}</span>
                    <strong
                      className={
                        grupo.nivel === 'vermelho' ? 'text-devolve-text' : 'text-conferir-text'
                      }
                    >
                      {grupo.titulo}
                    </strong>
                    <span className="rounded-full bg-tinta-100 px-1.5 text-xs font-medium tabular-nums text-tinta-600">
                      ×{grupo.quantidade}
                    </span>
                    <ExplicacaoAlerta
                      alerta={{
                        nivel: grupo.nivel,
                        codigo: grupo.codigo,
                        titulo: grupo.titulo,
                        detalhe: grupo.exemplo,
                        dados: grupo.dados,
                      }}
                    />
                    <span className="ml-auto text-xs tabular-nums text-tinta-500">
                      {formatarBRL(grupo.valorAfetado)}
                    </span>
                  </summary>

                  <div className="px-4 pb-3 pl-9">
                    <p className="text-xs leading-relaxed text-tinta-600">{grupo.exemplo}</p>
                    <p className="mt-1.5 flex flex-wrap gap-1.5">
                      {grupo.chequeIds.map((id, indice) => (
                        <a
                          key={id}
                          href={`#cheque-${id}`}
                          className="rounded border border-tinta-200 px-1.5 py-0.5 text-xs text-tinta-600 hover:border-tinta-400 hover:text-tinta-900"
                        >
                          ir ao cheque {indice + 1}
                        </a>
                      ))}
                    </p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
