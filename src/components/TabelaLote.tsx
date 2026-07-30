'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import EditarCheque from './EditarCheque'
import LinhaCheque from './LinhaCheque'
import { formatarBRL } from '@/lib/format'
import { agruparPorEmitente } from '@/lib/lote'
import type { ChequeRow } from '@/lib/supabase/types'

export interface ChequeComFoto extends ChequeRow {
  urlAssinada: string | null
}

/** O filtro existe para a operadora atacar uma fila por vez, não o lote todo. */
type Filtro = 'todos' | 'vermelhos' | 'conferir' | 'pendentes' | 'lancados'
type Ordem = 'emitente' | 'data' | 'valor' | 'status'

const FILTROS: Array<{ chave: Filtro; rotulo: string }> = [
  { chave: 'todos', rotulo: 'Todos' },
  { chave: 'vermelhos', rotulo: '🔴 Pode devolver' },
  { chave: 'conferir', rotulo: '🟡 Conferir' },
  { chave: 'pendentes', rotulo: 'A lançar' },
  { chave: 'lancados', rotulo: 'Lançados' },
]

const ORDENS: Array<{ chave: Ordem; rotulo: string }> = [
  { chave: 'emitente', rotulo: 'Por emitente' },
  { chave: 'data', rotulo: 'Por data' },
  { chave: 'valor', rotulo: 'Maior valor' },
  { chave: 'status', rotulo: 'Mais grave' },
]

const PESO_STATUS = { vermelho: 0, conferir: 1, ok: 2 } as const

function passaNoFiltro(cheque: ChequeComFoto, filtro: Filtro): boolean {
  switch (filtro) {
    case 'vermelhos':
      return cheque.status === 'vermelho'
    case 'conferir':
      return cheque.status === 'conferir'
    case 'pendentes':
      return !cheque.lancado
    case 'lancados':
      return cheque.lancado
    default:
      return true
  }
}

function dataDeOrdem(cheque: ChequeComFoto): string {
  return cheque.data_efetiva || cheque.bom_para || cheque.data_emissao || '9999-12-31'
}

export default function TabelaLote({ cheques: iniciais }: { cheques: ChequeComFoto[] }) {
  const router = useRouter()
  const [cheques, setCheques] = useState<ChequeComFoto[]>(iniciais)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [ordem, setOrdem] = useState<Ordem>('emitente')
  const [editando, setEditando] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<Record<string, boolean>>({})
  const [erro, setErro] = useState<string | null>(null)

  const contagem = useMemo(
    () => ({
      todos: cheques.length,
      vermelhos: cheques.filter((c) => c.status === 'vermelho').length,
      conferir: cheques.filter((c) => c.status === 'conferir').length,
      pendentes: cheques.filter((c) => !c.lancado).length,
      lancados: cheques.filter((c) => c.lancado).length,
    }),
    [cheques],
  )

  const visiveis = useMemo(
    () => cheques.filter((c) => passaNoFiltro(c, filtro)),
    [cheques, filtro],
  )

  const grupos = useMemo(
    () => (ordem === 'emitente' ? agruparPorEmitente(visiveis) : []),
    [visiveis, ordem],
  )

  const lista = useMemo(() => {
    if (ordem === 'emitente') return []
    const copia = [...visiveis]
    if (ordem === 'data') {
      copia.sort((a, b) => dataDeOrdem(a).localeCompare(dataDeOrdem(b)))
    } else if (ordem === 'valor') {
      copia.sort((a, b) => Number(b.valor_numerico ?? 0) - Number(a.valor_numerico ?? 0))
    } else {
      copia.sort((a, b) => {
        const peso = PESO_STATUS[a.status] - PESO_STATUS[b.status]
        if (peso !== 0) return peso
        return Number(b.valor_numerico ?? 0) - Number(a.valor_numerico ?? 0)
      })
    }
    return copia
  }, [visiveis, ordem])

  function substituir(atualizado: ChequeRow) {
    setCheques((atual) =>
      atual.map((c) =>
        c.id === atualizado.id ? { ...atualizado, urlAssinada: c.urlAssinada } : c,
      ),
    )
    // O painel de análise é renderizado no servidor: sem isso os totais e o
    // cronograma ficariam mostrando o estado anterior à correção.
    router.refresh()
  }

  async function alternarLancado(cheque: ChequeComFoto, proximo: boolean) {
    setErro(null)
    setCheques((atual) =>
      atual.map((c) => (c.id === cheque.id ? { ...c, lancado: proximo } : c)),
    )
    setSalvando((atual) => ({ ...atual, [cheque.id]: true }))
    try {
      const resposta = await fetch(`/api/cheques/${cheque.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lancado: proximo }),
      })
      if (!resposta.ok) throw new Error('falha ao salvar')
      router.refresh()
    } catch {
      // Volta ao valor real: marcar como lançado sem persistir seria pior que
      // não marcar — a operadora perderia o controle do progresso.
      setCheques((atual) =>
        atual.map((c) => (c.id === cheque.id ? { ...c, lancado: !proximo } : c)),
      )
      setErro('Não foi possível salvar o "lançado". Verifique a conexão e tente de novo.')
    } finally {
      setSalvando((atual) => ({ ...atual, [cheque.id]: false }))
    }
  }

  function corpo(cheque: ChequeComFoto, compacta: boolean) {
    return (
      <li
        key={cheque.id}
        id={`cheque-${cheque.id}`}
        className={`scroll-mt-20 px-4 py-3 ${
          cheque.status === 'vermelho'
            ? 'border-l-4 border-l-marca-risco bg-devolve-bg/40'
            : cheque.status === 'conferir'
              ? 'border-l-4 border-l-conferir-border'
              : ''
        } ${cheque.lancado ? 'opacity-60' : ''}`}
      >
        <LinhaCheque
          cheque={cheque}
          compacta={compacta}
          salvando={salvando[cheque.id]}
          onAlternarLancado={(proximo) => void alternarLancado(cheque, proximo)}
          onEditar={() => setEditando((atual) => (atual === cheque.id ? null : cheque.id))}
        />
        {editando === cheque.id && (
          <EditarCheque
            cheque={cheque}
            onCancelar={() => setEditando(null)}
            onSalvo={(atualizado) => {
              substituir(atualizado)
              setEditando(null)
            }}
          />
        )}
      </li>
    )
  }

  if (cheques.length === 0) {
    return (
      <p className="cartao px-4 py-6 text-sm text-slate-600">
        Nenhum cheque neste lote ainda. Envie as fotos para o app extrair.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {/* Controles em uma linha, acima do conteúdo. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map(({ chave, rotulo }) => (
            <button
              key={chave}
              type="button"
              onClick={() => setFiltro(chave)}
              aria-pressed={filtro === chave}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                filtro === chave
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {rotulo}
              <span className="ml-1 tabular-nums opacity-70">{contagem[chave]}</span>
            </button>
          ))}
        </div>

        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-500">
          Ordem
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as Ordem)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
          >
            {ORDENS.map(({ chave, rotulo }) => (
              <option key={chave} value={chave}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      {erro && (
        <p className="rounded-lg border border-devolve-border bg-devolve-bg px-3 py-2 text-sm text-devolve-text">
          {erro}
        </p>
      )}

      {visiveis.length === 0 ? (
        <p className="cartao px-4 py-6 text-sm text-slate-600">
          Nenhum cheque nesse filtro.{' '}
          <button
            type="button"
            onClick={() => setFiltro('todos')}
            className="underline hover:no-underline"
          >
            Ver todos
          </button>
          .
        </p>
      ) : ordem === 'emitente' ? (
        grupos.map((grupo) => (
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
              <span className="ml-auto text-sm font-semibold tabular-nums">
                {formatarBRL(grupo.subtotal)}
              </span>
            </header>
            <ul className="divide-y divide-slate-100">
              {grupo.cheques.map((cheque) => corpo(cheque, false))}
            </ul>
          </section>
        ))
      ) : (
        <section className="cartao overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {lista.map((cheque) => corpo(cheque, true))}
          </ul>
        </section>
      )}
    </div>
  )
}
