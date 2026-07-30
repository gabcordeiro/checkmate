import Link from 'next/link'
import { formatarBRL, normalizarEmitente } from '@/lib/format'
import { criarClienteServidor } from '@/lib/supabase/server'
import { formatarDataBr } from '@/lib/validation/datas'
import type { BatchRow } from '@/lib/supabase/types'

export const metadata = { title: 'Lotes — Cheque Mate' }

/** Aceita "29/07/2026", "2026-07-29" e "29/07" (ano corrente). */
function termoComoData(termo: string): string | null {
  const iso = termo.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`

  const br = termo.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (br) {
    const ano = br[3]
      ? br[3].length === 2
        ? `20${br[3]}`
        : br[3]
      : String(new Date().getUTCFullYear())
    return `${ano}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  }
  return null
}

/** Aceita "1842", "1.842,00" e "1842.00". */
function termoComoValor(termo: string): number | null {
  if (!/[\d]/.test(termo)) return null
  const limpo = termo.replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) && n > 0 ? n : null
}

export default async function LotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const termo = (q ?? '').trim()

  const supabase = await criarClienteServidor()

  // RLS já limita ao dono; não é preciso filtrar por owner_id.
  const { data: todos, error } = await supabase
    .from('batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  let lotes = (todos ?? []) as BatchRow[]

  if (termo) {
    // Busca por emitente / nº do cheque / valor: descobre em quais lotes o
    // cheque está e cruza com a lista.
    const filtros: string[] = [
      `emitente_normalizado.ilike.%${normalizarEmitente(termo)}%`,
      `numero_cheque.ilike.%${termo.replace(/\D/g, '')}%`,
    ]
    const valor = termoComoValor(termo)
    if (valor !== null) filtros.push(`valor_numerico.eq.${valor}`)
    const data = termoComoData(termo)
    if (data) filtros.push(`data_efetiva.eq.${data}`, `data_emissao.eq.${data}`)

    const { data: encontrados } = await supabase
      .from('cheques')
      .select('batch_id')
      .or(filtros.join(','))
      .limit(2000)

    const idsPorCheque = new Set((encontrados ?? []).map((c) => c.batch_id))
    const termoMinusculo = termo.toLowerCase()

    lotes = lotes.filter(
      (lote) =>
        idsPorCheque.has(lote.id) ||
        (lote.nome ?? '').toLowerCase().includes(termoMinusculo) ||
        (data ? lote.created_at.startsWith(data) : false),
    )
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Lotes</h1>
        <Link href="/lotes/novo" className="btn-primario px-3 py-1.5 text-xs">
          Novo lote
        </Link>
      </div>

      <form method="get" className="mt-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={termo}
          placeholder="Buscar por emitente, nº do cheque, data ou valor"
          className="campo mt-0 flex-1"
        />
        <button type="submit" className="btn-secundario">
          Buscar
        </button>
        {termo && (
          <Link href="/lotes" className="btn-secundario">
            Limpar
          </Link>
        )}
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-devolve-border bg-devolve-bg px-3 py-2 text-sm text-devolve-text">
          Não foi possível carregar os lotes: {error.message}
        </p>
      )}

      {lotes.length === 0 ? (
        <p className="mt-6 cartao px-4 py-8 text-center text-sm text-slate-600">
          {termo
            ? 'Nenhum lote encontrado para essa busca.'
            : 'Nenhum lote ainda. Comece enviando as fotos de uma operação.'}
        </p>
      ) : (
        <ul className="mt-5 space-y-2">
          {lotes.map((lote) => (
            <li key={lote.id}>
              <Link
                href={`/lotes/${lote.id}`}
                className="cartao flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 transition hover:border-slate-300 hover:shadow"
              >
                <span className="font-medium">
                  {lote.nome?.trim() || `Lote de ${formatarDataBr(lote.created_at.slice(0, 10))}`}
                </span>
                <span className="text-xs text-slate-500">
                  {formatarDataBr(lote.created_at.slice(0, 10))}
                </span>
                <span className="ml-auto text-sm text-slate-600">
                  {lote.total_cheques} {lote.total_cheques === 1 ? 'cheque' : 'cheques'}
                </span>
                <span className="w-28 text-right text-sm font-semibold">
                  {formatarBRL(Number(lote.total_valor))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
