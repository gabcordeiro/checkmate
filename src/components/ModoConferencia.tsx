'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Cmc7 from './Cmc7'
import EditarCheque from './EditarCheque'
import FotoCheque from './FotoCheque'
import StatusBadge from './StatusBadge'
import { linhaTabulada, valorParaDigitar } from './LinhaCheque'
import type { ChequeComFoto } from './TabelaLote'
import { copiarTexto } from '@/lib/clipboard'
import { formatarBRL } from '@/lib/format'
import { formatarDataBr } from '@/lib/validation/datas'
import type { ChequeRow } from '@/lib/supabase/types'

/**
 * Modo conferência — um cheque de cada vez, sem sair do teclado.
 *
 * É onde o tempo da operadora é ganho ou perdido. O loop real dela é:
 * ver a foto → copiar o CMC7 → colar no sistema → digitar valor e data →
 * marcar como lançado → próximo. Cada uma dessas etapas tem uma tecla, e
 * "marcar e avançar" é uma só (Enter), então um cheque sai em 4 toques.
 */

type Fila = 'pendentes' | 'todos' | 'vermelhos'

const FILAS: Array<{ chave: Fila; rotulo: string }> = [
  { chave: 'pendentes', rotulo: 'A lançar' },
  { chave: 'vermelhos', rotulo: '🔴 Pode devolver' },
  { chave: 'todos', rotulo: 'Todos' },
]

const ATALHOS: Array<[string, string]> = [
  ['C', 'copiar CMC7'],
  ['V', 'copiar valor'],
  ['D', 'copiar data'],
  ['L', 'copiar linha (planilha)'],
  ['Enter', 'marcar lançado e avançar'],
  ['→ / ←', 'próximo / anterior'],
  ['Z', 'ampliar a foto'],
  ['E', 'corrigir leitura'],
  ['?', 'mostrar estes atalhos'],
]

function dataDeOrdem(cheque: ChequeComFoto): string {
  return cheque.data_efetiva || cheque.bom_para || cheque.data_emissao || '9999-12-31'
}

export default function ModoConferencia({
  cheques: iniciais,
  loteId,
  nomeLote,
}: {
  cheques: ChequeComFoto[]
  loteId: string
  nomeLote: string
}) {
  const router = useRouter()
  const [cheques, setCheques] = useState<ChequeComFoto[]>(iniciais)
  const [fila, setFila] = useState<Fila>('pendentes')
  const [indice, setIndice] = useState(0)
  const [editando, setEditando] = useState(false)
  const [fotoAberta, setFotoAberta] = useState(false)
  const [atalhosVisiveis, setAtalhosVisiveis] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const timerAviso = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ordenados = useMemo(
    () => [...cheques].sort((a, b) => dataDeOrdem(a).localeCompare(dataDeOrdem(b))),
    [cheques],
  )

  /**
   * A fila é congelada por escolha de fila, não recalculada a cada marcação:
   * se ela sumisse da lista no instante em que a operadora marca "lançado",
   * o índice pularia e ela perderia o lugar.
   */
  const [idsDaFila, setIdsDaFila] = useState<string[]>(() =>
    ordenados.filter((c) => !c.lancado).map((c) => c.id),
  )

  const trocarFila = useCallback(
    (proxima: Fila) => {
      setFila(proxima)
      const ids = ordenados
        .filter((c) =>
          proxima === 'pendentes'
            ? !c.lancado
            : proxima === 'vermelhos'
              ? c.status === 'vermelho'
              : true,
        )
        .map((c) => c.id)
      setIdsDaFila(ids.length > 0 ? ids : ordenados.map((c) => c.id))
      setIndice(0)
      setEditando(false)
    },
    [ordenados],
  )

  const visiveis = useMemo(
    () =>
      idsDaFila
        .map((id) => cheques.find((c) => c.id === id))
        .filter((c): c is ChequeComFoto => Boolean(c)),
    [idsDaFila, cheques],
  )

  const atual = visiveis[Math.min(indice, Math.max(0, visiveis.length - 1))]
  const lancadosNaFila = visiveis.filter((c) => c.lancado).length

  function sinalizar(mensagem: string) {
    setAviso(mensagem)
    if (timerAviso.current) clearTimeout(timerAviso.current)
    timerAviso.current = setTimeout(() => setAviso(null), 1400)
  }

  useEffect(() => {
    return () => {
      if (timerAviso.current) clearTimeout(timerAviso.current)
    }
  }, [])

  const copiar = useCallback(
    async (texto: string, rotulo: string) => {
      if (!texto) {
        sinalizar(`Sem ${rotulo} para copiar`)
        return
      }
      sinalizar((await copiarTexto(texto)) ? `${rotulo} copiado` : `Falha ao copiar ${rotulo}`)
    },
    [],
  )

  const marcarLancado = useCallback(
    async (cheque: ChequeComFoto, proximo: boolean) => {
      setErro(null)
      setCheques((lista) =>
        lista.map((c) => (c.id === cheque.id ? { ...c, lancado: proximo } : c)),
      )
      try {
        const resposta = await fetch(`/api/cheques/${cheque.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lancado: proximo }),
        })
        if (!resposta.ok) throw new Error('falha')
        router.refresh()
      } catch {
        setCheques((lista) =>
          lista.map((c) => (c.id === cheque.id ? { ...c, lancado: !proximo } : c)),
        )
        setErro('Não foi possível salvar o "lançado". Verifique a conexão.')
      }
    },
    [router],
  )

  const avancar = useCallback(() => {
    setIndice((atualIndice) => Math.min(atualIndice + 1, visiveis.length - 1))
    setEditando(false)
  }, [visiveis.length])

  const voltar = useCallback(() => {
    setIndice((atualIndice) => Math.max(atualIndice - 1, 0))
    setEditando(false)
  }, [])

  // Atalhos de teclado. Não disparam com foco em campo de texto nem com o
  // formulário de correção aberto (ele para a propagação por conta própria).
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.metaKey || evento.ctrlKey || evento.altKey) return
      const alvo = evento.target as HTMLElement | null
      if (
        alvo &&
        (alvo.tagName === 'INPUT' ||
          alvo.tagName === 'TEXTAREA' ||
          alvo.tagName === 'SELECT' ||
          alvo.isContentEditable)
      ) {
        return
      }
      if (!atual) return

      const tecla = evento.key.toLowerCase()

      if (tecla === '?') {
        evento.preventDefault()
        setAtalhosVisiveis((v) => !v)
        return
      }
      if (fotoAberta && tecla !== 'z') return

      switch (tecla) {
        case 'c':
          evento.preventDefault()
          void copiar(atual.cmc7_completo ?? '', 'CMC7')
          break
        case 'v':
          evento.preventDefault()
          void copiar(valorParaDigitar(atual), 'valor')
          break
        case 'd': {
          evento.preventDefault()
          const data = formatarDataBr(atual.data_efetiva ?? atual.data_emissao)
          void copiar(data === '—' ? '' : data, 'data')
          break
        }
        case 'l':
          evento.preventDefault()
          void copiar(linhaTabulada(atual), 'linha')
          break
        case 'e':
          evento.preventDefault()
          setEditando((v) => !v)
          break
        case 'z':
          evento.preventDefault()
          setFotoAberta((v) => !v)
          break
        case 'enter':
          evento.preventDefault()
          if (!atual.lancado) void marcarLancado(atual, true)
          avancar()
          break
        case 'arrowright':
        case 'j':
          evento.preventDefault()
          avancar()
          break
        case 'arrowleft':
        case 'k':
          evento.preventDefault()
          voltar()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [atual, avancar, copiar, fotoAberta, marcarLancado, voltar])

  function substituir(atualizado: ChequeRow) {
    setCheques((lista) =>
      lista.map((c) =>
        c.id === atualizado.id ? { ...atualizado, urlAssinada: c.urlAssinada } : c,
      ),
    )
    router.refresh()
  }

  if (cheques.length === 0) {
    return (
      <div className="cartao px-4 py-8 text-center text-sm text-slate-600">
        Este lote não tem cheques.{' '}
        <Link href={`/lotes/${loteId}`} className="underline">
          Voltar ao lote
        </Link>
      </div>
    )
  }

  if (!atual) {
    return (
      <div className="cartao px-4 py-8 text-center">
        <p className="text-sm font-medium text-ok-text">Fila vazia — nada pendente aqui.</p>
        <div className="mt-3 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => trocarFila('todos')}
            className="btn-secundario px-3 py-1.5 text-xs"
          >
            Ver todos
          </button>
          <Link href={`/lotes/${loteId}`} className="btn-primario px-3 py-1.5 text-xs">
            Voltar ao lote
          </Link>
        </div>
      </div>
    )
  }

  const vermelhos = (atual.alertas ?? []).filter((a) => a.nivel === 'vermelho')
  const amarelos = (atual.alertas ?? []).filter((a) => a.nivel === 'amarelo')
  const cmc7 = atual.cmc7_completo ?? ''
  const valor = valorParaDigitar(atual)
  const dataTexto = formatarDataBr(atual.data_efetiva ?? atual.data_emissao)

  return (
    <div className="space-y-4">
      {/* Cabeçalho: onde ela está na fila e qual fila é. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tabular-nums">
            {indice + 1}
            <span className="text-slate-400"> / {visiveis.length}</span>
          </span>
          <span className="text-xs text-slate-500">
            {lancadosNaFila} lançados nesta fila · {nomeLote}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILAS.map(({ chave, rotulo }) => (
            <button
              key={chave}
              type="button"
              onClick={() => trocarFila(chave)}
              aria-pressed={fila === chave}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                fila === chave
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setAtalhosVisiveis((v) => !v)}
          className="ml-auto text-xs text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          Atalhos (?)
        </button>
      </div>

      <div
        role="progressbar"
        aria-valuenow={indice + 1}
        aria-valuemin={1}
        aria-valuemax={visiveis.length}
        aria-label="Posição na fila de conferência"
        className="h-1 overflow-hidden rounded-full bg-slate-200"
      >
        <span
          className="block h-full rounded-full bg-slate-700 transition-all"
          style={{ width: `${((indice + 1) / visiveis.length) * 100}%` }}
        />
      </div>

      {atalhosVisiveis && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs sm:grid-cols-3">
          {ATALHOS.map(([tecla, acao]) => (
            <div key={tecla} className="flex items-baseline gap-2">
              <dt>
                <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px]">
                  {tecla}
                </kbd>
              </dt>
              <dd className="text-slate-600">{acao}</dd>
            </div>
          ))}
        </dl>
      )}

      {erro && (
        <p className="rounded-lg border border-devolve-border bg-devolve-bg px-3 py-2 text-sm text-devolve-text">
          {erro}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Foto grande: a conferência é visual. */}
        <div>
          <FotoCheque
            url={atual.urlAssinada}
            legenda={atual.numero_cheque ?? atual.id.slice(0, 8)}
            variante="painel"
            aberta={fotoAberta}
            onFechar={() => setFotoAberta(false)}
          />
          <button
            type="button"
            onClick={() => setFotoAberta(true)}
            disabled={!atual.urlAssinada}
            className="btn-secundario mt-2 w-full px-3 py-1.5 text-xs"
          >
            Ampliar a foto (Z)
          </button>
        </div>

        {/* Dados, na ordem em que ela digita no sistema. */}
        <div
          className={`cartao space-y-3 p-4 ${
            atual.status === 'vermelho' ? 'border-devolve-border' : ''
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide">
                {atual.emitente?.trim() || 'Emitente não identificado'}
              </p>
              <p className="text-xs text-slate-500">
                {atual.banco_nome || atual.banco_codigo || 'banco não lido'}
                {atual.agencia ? ` · ag ${atual.agencia}` : ''}
                {atual.conta ? ` · cc ${atual.conta}` : ''}
                {atual.nominal ? ` · para ${atual.nominal}` : ''}
              </p>
            </div>
            <StatusBadge status={atual.status} />
          </div>

          <dl className="grid grid-cols-3 gap-3 border-y border-slate-100 py-3">
            <div>
              <dt className="text-[11px] font-medium text-slate-500">Nº do cheque</dt>
              <dd className="text-sm font-medium tabular-nums">{atual.numero_cheque ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-slate-500">Data efetiva</dt>
              <dd className="text-sm font-medium tabular-nums">{dataTexto}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-slate-500">Valor</dt>
              <dd className="text-sm font-semibold tabular-nums">
                {formatarBRL(
                  atual.valor_numerico === null ? null : Number(atual.valor_numerico),
                )}
              </dd>
            </div>
          </dl>

          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-500">CMC7</p>
            <Cmc7
              bloco1={atual.cmc7_bloco1}
              bloco2={atual.cmc7_bloco2}
              bloco3={atual.cmc7_bloco3}
              duvidosos={atual.digitos_duvidosos ?? []}
              sugestoes={atual.cmc7_sugestoes ?? []}
            />
          </div>

          {/* Botões de cópia com a tecla ao lado: quem usa teclado aprende sozinha. */}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void copiar(cmc7, 'CMC7')}
              disabled={!cmc7}
              className="btn-primario px-3 py-1.5 text-xs"
            >
              Copiar CMC7 <kbd className="font-mono opacity-60">C</kbd>
            </button>
            <button
              type="button"
              onClick={() => void copiar(valor, 'valor')}
              disabled={!valor}
              className="btn-secundario px-3 py-1.5 text-xs"
            >
              {valor || '—'} <kbd className="font-mono opacity-60">V</kbd>
            </button>
            <button
              type="button"
              onClick={() => void copiar(dataTexto === '—' ? '' : dataTexto, 'data')}
              disabled={dataTexto === '—'}
              className="btn-secundario px-3 py-1.5 text-xs"
            >
              {dataTexto} <kbd className="font-mono opacity-60">D</kbd>
            </button>
            <button
              type="button"
              onClick={() => void copiar(linhaTabulada(atual), 'linha')}
              className="btn-secundario px-3 py-1.5 text-xs"
            >
              Linha <kbd className="font-mono opacity-60">L</kbd>
            </button>
          </div>

          {atual.valor_extenso_texto && (
            <p className="text-xs italic text-slate-500">
              Extenso lido: “{atual.valor_extenso_texto}”
              {atual.valor_extenso_convertido !== null && (
                <> → {formatarBRL(Number(atual.valor_extenso_convertido))}</>
              )}
            </p>
          )}

          {vermelhos.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-devolve-border bg-devolve-bg px-3 py-2">
              {vermelhos.map((alerta, i) => (
                <li key={`${alerta.codigo}-${i}`} className="text-xs leading-relaxed text-devolve-text">
                  <span aria-hidden>🔴</span> <strong>{alerta.titulo}.</strong> {alerta.detalhe}
                </li>
              ))}
            </ul>
          )}

          {amarelos.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-conferir-border bg-conferir-bg px-3 py-2">
              {amarelos.map((alerta, i) => (
                <li
                  key={`${alerta.codigo}-${i}`}
                  className="text-xs leading-relaxed text-conferir-text"
                >
                  <span aria-hidden>🟡</span> <strong>{alerta.titulo}.</strong> {alerta.detalhe}
                </li>
              ))}
            </ul>
          )}

          {atual.alertas.length === 0 && (
            <p className="rounded-lg border border-ok-border bg-ok-bg px-3 py-2 text-xs text-ok-text">
              Nenhum alerta. Confirme na foto e lance.
            </p>
          )}

          {editando ? (
            <EditarCheque
              cheque={atual}
              onCancelar={() => setEditando(false)}
              onSalvo={(atualizado) => {
                substituir(atualizado)
                setEditando(false)
              }}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  if (!atual.lancado) void marcarLancado(atual, true)
                  avancar()
                }}
                className="btn-primario px-3 py-2 text-xs"
              >
                {atual.lancado ? 'Já lançado — avançar' : 'Marcar lançado e avançar'}{' '}
                <kbd className="font-mono opacity-60">↵</kbd>
              </button>
              {atual.lancado && (
                <button
                  type="button"
                  onClick={() => void marcarLancado(atual, false)}
                  className="btn-secundario px-3 py-2 text-xs"
                >
                  Desmarcar
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="btn-secundario px-3 py-2 text-xs"
              >
                Corrigir leitura <kbd className="font-mono opacity-60">E</kbd>
              </button>
              <div className="ml-auto flex gap-1.5">
                <button
                  type="button"
                  onClick={voltar}
                  disabled={indice === 0}
                  className="btn-secundario px-2.5 py-2 text-xs"
                  aria-label="Cheque anterior"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={avancar}
                  disabled={indice >= visiveis.length - 1}
                  className="btn-secundario px-2.5 py-2 text-xs"
                  aria-label="Próximo cheque"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmação do que foi copiado, sem roubar o foco. */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2">
        {aviso && (
          <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
            {aviso}
          </span>
        )}
      </div>
    </div>
  )
}
