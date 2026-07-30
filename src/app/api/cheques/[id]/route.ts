import { NextResponse, type NextRequest } from 'next/server'
import { criarClienteServidor } from '@/lib/supabase/server'

/**
 * Marca/desmarca "lançado no sistema". É o único campo que a tela do lote
 * escreve — o resto vem da extração e da validação.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const corpo = (await request.json().catch(() => null)) as { lancado?: unknown } | null
  if (typeof corpo?.lancado !== 'boolean') {
    return NextResponse.json({ error: 'Campo "lancado" (boolean) é obrigatório.' }, { status: 400 })
  }

  // RLS garante que só o dono atualiza; o select confirma que a linha existia.
  const { data, error } = await supabase
    .from('cheques')
    .update({ lancado: corpo.lancado })
    .eq('id', id)
    .select('id, lancado')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Cheque não encontrado.' }, { status: 404 })

  return NextResponse.json(data)
}
