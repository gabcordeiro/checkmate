'use client'

import { useState } from 'react'
import type { ChequeRow } from '@/lib/supabase/types'

/**
 * Correção manual. A operadora é a decisora: quando o modelo lê errado, ela
 * conserta aqui e o servidor REVALIDA a linha (DV do CMC7, parser do extenso,
 * datas). Por isso o formulário não calcula nada — ele manda o campo e recebe
 * de volta o cheque já revalidado.
 */

export interface Props {
  cheque: ChequeRow
  onSalvo: (cheque: ChequeRow) => void
  onCancelar: () => void
}

type Formulario = {
  emitente: string
  nominal: string
  numero_cheque: string
  valor_numerico: string
  valor_extenso_texto: string
  data_emissao: string
  bom_para: string
  cmc7_bloco1: string
  cmc7_bloco2: string
  cmc7_bloco3: string
  banco_codigo: string
  agencia: string
  conta: string
  assinatura_presente: boolean
}

function doCheque(cheque: ChequeRow): Formulario {
  return {
    emitente: cheque.emitente ?? '',
    nominal: cheque.nominal ?? '',
    numero_cheque: cheque.numero_cheque ?? '',
    valor_numerico:
      cheque.valor_numerico === null ? '' : String(Number(cheque.valor_numerico)).replace('.', ','),
    valor_extenso_texto: cheque.valor_extenso_texto ?? '',
    data_emissao: cheque.data_emissao ?? '',
    bom_para: cheque.bom_para ?? '',
    cmc7_bloco1: cheque.cmc7_bloco1 ?? '',
    cmc7_bloco2: cheque.cmc7_bloco2 ?? '',
    cmc7_bloco3: cheque.cmc7_bloco3 ?? '',
    banco_codigo: cheque.banco_codigo ?? '',
    agencia: cheque.agencia ?? '',
    conta: cheque.conta ?? '',
    assinatura_presente: cheque.assinatura_presente === true,
  }
}

const TAMANHO_BLOCO = { cmc7_bloco1: 8, cmc7_bloco2: 12, cmc7_bloco3: 10 } as const

export default function EditarCheque({ cheque, onSalvo, onCancelar }: Props) {
  const [form, setForm] = useState<Formulario>(() => doCheque(cheque))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function alterar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
  }

  async function salvar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setSalvando(true)
    try {
      const resposta = await fetch(`/api/cheques/${cheque.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Manda tudo: o servidor normaliza e revalida. Campo vazio = limpar.
        body: JSON.stringify({
          campos: {
            emitente: form.emitente,
            nominal: form.nominal,
            numero_cheque: form.numero_cheque,
            valor_numerico: form.valor_numerico,
            valor_extenso_texto: form.valor_extenso_texto,
            data_emissao: form.data_emissao,
            bom_para: form.bom_para,
            cmc7_bloco1: form.cmc7_bloco1,
            cmc7_bloco2: form.cmc7_bloco2,
            cmc7_bloco3: form.cmc7_bloco3,
            banco_codigo: form.banco_codigo,
            agencia: form.agencia,
            conta: form.conta,
            assinatura_presente: form.assinatura_presente,
          },
        }),
      })
      const corpo = (await resposta.json().catch(() => ({}))) as {
        cheque?: ChequeRow
        error?: string
      }
      if (!resposta.ok || !corpo.cheque) {
        throw new Error(corpo.error || `Falha ao salvar (${resposta.status}).`)
      }
      onSalvo(corpo.cheque)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro inesperado ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const campoBloco = (chave: 'cmc7_bloco1' | 'cmc7_bloco2' | 'cmc7_bloco3', rotulo: string) => {
    const esperado = TAMANHO_BLOCO[chave]
    const atual = form[chave].replace(/\D/g, '').length
    const foraDoTamanho = atual > 0 && atual !== esperado
    return (
      <label className="block">
        <span className="text-xs font-medium text-slate-600">
          {rotulo}{' '}
          <span className={foraDoTamanho ? 'text-devolve-text' : 'text-slate-400'}>
            {atual}/{esperado}
          </span>
        </span>
        <input
          value={form[chave]}
          onChange={(e) => alterar(chave, e.target.value.replace(/\D/g, '').slice(0, esperado))}
          inputMode="numeric"
          className="campo font-mono text-[13px]"
        />
      </label>
    )
  }

  return (
    <form
      onSubmit={salvar}
      className="mt-2 rounded-lg border border-slate-300 bg-slate-50 p-3"
      onKeyDown={(e) => {
        // Não deixa os atalhos do modo conferência disparar enquanto digita.
        e.stopPropagation()
        if (e.key === 'Escape') onCancelar()
      }}
    >
      <p className="text-xs text-slate-600">
        Corrija o que o modelo leu errado. Ao salvar, a validação roda de novo — DV do CMC7,
        extenso × numérico e datas.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Emitente</span>
          <input
            value={form.emitente}
            onChange={(e) => alterar('emitente', e.target.value)}
            className="campo"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Nominal</span>
          <input
            value={form.nominal}
            onChange={(e) => alterar('nominal', e.target.value)}
            className="campo"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Nº do cheque</span>
          <input
            value={form.numero_cheque}
            onChange={(e) => alterar('numero_cheque', e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            className="campo"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Valor em algarismos</span>
          <input
            value={form.valor_numerico}
            onChange={(e) => alterar('valor_numerico', e.target.value)}
            inputMode="decimal"
            placeholder="1842,50"
            className="campo tabular-nums"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-slate-600">
            Valor por extenso (transcreva literal, com os erros do emitente)
          </span>
          <input
            value={form.valor_extenso_texto}
            onChange={(e) => alterar('valor_extenso_texto', e.target.value)}
            className="campo"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Data escrita no cheque</span>
          <input
            type="date"
            value={form.data_emissao}
            onChange={(e) => alterar('data_emissao', e.target.value)}
            className="campo"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Bom para (se anotado)</span>
          <input
            type="date"
            value={form.bom_para}
            onChange={(e) => alterar('bom_para', e.target.value)}
            className="campo"
          />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {campoBloco('cmc7_bloco1', 'CMC7 bloco 1')}
        {campoBloco('cmc7_bloco2', 'CMC7 bloco 2')}
        {campoBloco('cmc7_bloco3', 'CMC7 bloco 3')}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-900">
          Banco, agência e conta
        </summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Banco</span>
            <input
              value={form.banco_codigo}
              onChange={(e) => alterar('banco_codigo', e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="campo"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Agência</span>
            <input
              value={form.agencia}
              onChange={(e) => alterar('agencia', e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="campo"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Conta</span>
            <input
              value={form.conta}
              onChange={(e) => alterar('conta', e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="campo"
            />
          </label>
        </div>
      </details>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.assinatura_presente}
          onChange={(e) => alterar('assinatura_presente', e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        Assinatura presente na foto
      </label>

      {erro && (
        <p className="mt-3 rounded-lg border border-devolve-border bg-devolve-bg px-3 py-2 text-sm text-devolve-text">
          {erro}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={salvando} className="btn-primario px-3 py-1.5 text-xs">
          {salvando ? 'Revalidando…' : 'Salvar e revalidar'}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="btn-secundario px-3 py-1.5 text-xs"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
