import { NextResponse, type NextRequest } from 'next/server'
import { criarClienteServidor } from '@/lib/supabase/server'
import { loteParaCsv, nomeArquivoCsv } from '@/lib/csv'
import type { ChequeRow } from '@/lib/supabase/types'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: lote } = await supabase
    .from('batches')
    .select('id, nome, created_at')
    .eq('id', id)
    .maybeSingle()
  if (!lote) return NextResponse.json({ error: 'Lote não encontrado.' }, { status: 404 })

  const { data: cheques, error } = await supabase.from('cheques').select('*').eq('batch_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const csv = loteParaCsv((cheques ?? []) as ChequeRow[])

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeArquivoCsv(lote.nome, lote.created_at)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
