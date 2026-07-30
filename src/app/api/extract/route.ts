import { NextResponse, type NextRequest } from 'next/server'
import { criarClienteServidor } from '@/lib/supabase/server'
import { colunasDoCheque } from '@/lib/cheque'
import { ErroVisao, extrairChequesDaImagem } from '@/lib/vision'

/**
 * upload → Storage → visão → JSON → validação → persistência.
 *
 * Roda no servidor porque é aqui que a chave da IA vive (mesma decisão do
 * MatchCV). O cliente Supabase usado é o do USUÁRIO, então RLS continua valendo
 * para tudo que a rota lê e escreve — nada de service_role aqui.
 */

export const runtime = 'nodejs'
// Ler cheque de foto grande passa dos 10s do default da Vercel.
export const maxDuration = 60

function erro(mensagem: string, status: number) {
  return NextResponse.json({ error: mensagem }, { status })
}

export async function POST(request: NextRequest) {
  const supabase = await criarClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return erro('Não autenticado.', 401)

  const corpo = (await request.json().catch(() => null)) as {
    batch_id?: string
    storage_path?: string
  } | null

  const batchId = corpo?.batch_id
  const storagePath = corpo?.storage_path
  if (!batchId || !storagePath) return erro('batch_id e storage_path são obrigatórios.', 400)

  // O caminho tem de estar dentro da pasta do próprio usuário — a policy de
  // Storage já garante, mas checar aqui evita uma chamada inútil.
  if (!storagePath.startsWith(`${user.id}/`)) return erro('Caminho de arquivo inválido.', 403)

  // RLS: só encontra o lote se for do usuário.
  const { data: lote } = await supabase.from('batches').select('id').eq('id', batchId).maybeSingle()
  if (!lote) return erro('Lote não encontrado.', 404)

  const { data: arquivo, error: erroDownload } = await supabase.storage
    .from('cheques')
    .download(storagePath)
  if (erroDownload || !arquivo) return erro('Não foi possível ler a foto enviada.', 404)

  const bytes = Buffer.from(await arquivo.arrayBuffer())
  const mimeType = arquivo.type || 'image/jpeg'

  let extraidos
  try {
    extraidos = await extrairChequesDaImagem({ base64: bytes.toString('base64'), mimeType })
  } catch (e) {
    if (e instanceof ErroVisao) return erro(e.message, e.status)
    return erro('Falha ao chamar o modelo de visão.', 502)
  }

  if (extraidos.length === 0) {
    return NextResponse.json({
      cheques: 0,
      aviso:
        'Nenhum cheque reconhecido nesta foto. Refotografe com o cheque preenchendo o quadro e boa luz.',
    })
  }

  const linhas = extraidos.map((cheque) => ({
    batch_id: batchId,
    owner_id: user.id,
    storage_path: storagePath,
    ...colunasDoCheque(cheque),
  }))

  const { data: inseridos, error: erroInsert } = await supabase
    .from('cheques')
    .insert(linhas)
    .select('id, status')

  if (erroInsert) return erro(`Não foi possível salvar os cheques: ${erroInsert.message}`, 500)

  return NextResponse.json({
    cheques: inseridos?.length ?? 0,
    vermelhos: inseridos?.filter((c) => c.status === 'vermelho').length ?? 0,
  })
}
