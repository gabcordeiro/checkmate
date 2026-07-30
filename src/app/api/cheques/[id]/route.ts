import { NextResponse, type NextRequest } from 'next/server'
import { criarClienteServidor } from '@/lib/supabase/server'
import {
  aplicarEdicao,
  colunasDoCheque,
  linhaParaExtraido,
  type EdicaoCheque,
} from '@/lib/cheque'
import type { ChequeRow } from '@/lib/supabase/types'

/**
 * PATCH de um cheque. Dois usos:
 *
 *  { lancado: true }            → marca/desmarca "lançado no sistema"
 *  { campos: { ... } }          → correção manual da operadora, que REVALIDA a
 *                                 linha inteira no servidor (DV do CMC7, parser
 *                                 do extenso, datas) e regrava status e alertas
 *
 * A revalidação roda aqui, e não no browser, porque status/alertas são a
 * verdade do registro — não podem depender do que o client mandou.
 */

function erro(mensagem: string, status: number) {
  return NextResponse.json({ error: mensagem }, { status })
}

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim()
  return limpo || null
}

function digitos(valor: unknown): string | null {
  const t = texto(valor)
  if (!t) return null
  const somente = t.replace(/\D/g, '')
  return somente || null
}

function numero(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor
  const t = texto(valor)
  if (!t) return null
  const limpo = t
    .replace(/[R$\s]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

function dataIso(valor: unknown): string | null {
  const t = texto(valor)
  if (!t) return null
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3]
    return `${ano}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  }
  return null
}

/** Só deixa passar campo conhecido, com o tipo certo. */
function normalizarEdicao(bruto: Record<string, unknown>): EdicaoCheque {
  const edicao: EdicaoCheque = {}

  if ('emitente' in bruto) edicao.emitente = texto(bruto.emitente)
  if ('nominal' in bruto) edicao.nominal = texto(bruto.nominal)
  if ('numero_cheque' in bruto) edicao.numero_cheque = digitos(bruto.numero_cheque)
  if ('banco_codigo' in bruto) edicao.banco_codigo = digitos(bruto.banco_codigo)
  if ('agencia' in bruto) edicao.agencia = digitos(bruto.agencia)
  if ('conta' in bruto) edicao.conta = digitos(bruto.conta)
  if ('valor_numerico' in bruto) edicao.valor_numerico = numero(bruto.valor_numerico)
  if ('valor_extenso_texto' in bruto) edicao.valor_extenso_texto = texto(bruto.valor_extenso_texto)
  if ('data_emissao' in bruto) edicao.data_emissao = dataIso(bruto.data_emissao)
  if ('bom_para' in bruto) edicao.bom_para = dataIso(bruto.bom_para)
  if ('cmc7_bloco1' in bruto) edicao.cmc7_bloco1 = digitos(bruto.cmc7_bloco1)
  if ('cmc7_bloco2' in bruto) edicao.cmc7_bloco2 = digitos(bruto.cmc7_bloco2)
  if ('cmc7_bloco3' in bruto) edicao.cmc7_bloco3 = digitos(bruto.cmc7_bloco3)
  if ('assinatura_presente' in bruto) {
    edicao.assinatura_presente = bruto.assinatura_presente === true
  }

  return edicao
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return erro('Não autenticado.', 401)

  const corpo = (await request.json().catch(() => null)) as {
    lancado?: unknown
    campos?: unknown
  } | null
  if (!corpo) return erro('Corpo inválido.', 400)

  const temLancado = typeof corpo.lancado === 'boolean'
  const temCampos =
    corpo.campos !== null && typeof corpo.campos === 'object' && !Array.isArray(corpo.campos)

  if (!temLancado && !temCampos) {
    return erro('Informe "lancado" (boolean) e/ou "campos" (objeto).', 400)
  }

  // Só o "lançado" mudou: um update simples, sem revalidar nada.
  if (!temCampos) {
    const { data, error } = await supabase
      .from('cheques')
      .update({ lancado: corpo.lancado as boolean })
      .eq('id', id)
      .select('id, lancado')
      .maybeSingle()

    if (error) return erro(error.message, 500)
    if (!data) return erro('Cheque não encontrado.', 404)
    return NextResponse.json(data)
  }

  // Correção manual: lê a linha atual (RLS garante que é dela), aplica a
  // edição sobre o extraído e revalida tudo.
  const { data: atual, error: erroLeitura } = await supabase
    .from('cheques')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (erroLeitura) return erro(erroLeitura.message, 500)
  if (!atual) return erro('Cheque não encontrado.', 404)

  const edicao = normalizarEdicao(corpo.campos as Record<string, unknown>)
  if (Object.keys(edicao).length === 0) return erro('Nenhum campo editável reconhecido.', 400)

  const revalidado = colunasDoCheque(
    aplicarEdicao(linhaParaExtraido(atual as ChequeRow), edicao),
  )

  const { data, error } = await supabase
    .from('cheques')
    .update({
      ...revalidado,
      revisado_manualmente: true,
      ...(temLancado ? { lancado: corpo.lancado as boolean } : {}),
    })
    .eq('id', id)
    .select('*')
    .maybeSingle()

  if (error) return erro(error.message, 500)
  if (!data) return erro('Cheque não encontrado.', 404)

  return NextResponse.json({ cheque: data })
}
