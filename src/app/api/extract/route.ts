import { NextResponse, type NextRequest } from 'next/server'
import { criarClienteServidor } from '@/lib/supabase/server'
import { normalizarEmitente } from '@/lib/format'
import { cmc7Cru, montarCmc7Completo } from '@/lib/validation/cmc7'
import { validarCheque } from '@/lib/validation'
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

  const linhas = extraidos.map((cheque) => {
    const validacao = validarCheque(cheque)
    const bloco1 = cheque.cmc7.bloco1
    const bloco2 = cheque.cmc7.bloco2
    const bloco3 = cheque.cmc7.bloco3

    return {
      batch_id: batchId,
      owner_id: user.id,
      storage_path: storagePath,
      emitente: cheque.emitente,
      emitente_normalizado: normalizarEmitente(cheque.emitente),
      banco_codigo: cheque.banco_codigo,
      banco_nome: cheque.banco_nome,
      agencia: cheque.agencia,
      conta: cheque.conta,
      numero_cheque: cheque.numero_cheque,
      cmc7_bloco1: bloco1,
      cmc7_bloco2: bloco2,
      cmc7_bloco3: bloco3,
      // Guardamos os 30 dígitos crus: é o que vai para o clipboard e para o CSV.
      cmc7_completo: cmc7Cru(bloco1, bloco2, bloco3) ?? montarCmc7Completo(bloco1, bloco2, bloco3),
      digitos_duvidosos: cheque.cmc7.digitos_duvidosos,
      cmc7_sugestoes: validacao.cmc7_sugestoes,
      valor_numerico: cheque.valor_numerico,
      valor_extenso_texto: cheque.valor_extenso_texto,
      valor_extenso_convertido: validacao.valor_extenso_convertido,
      data_emissao: cheque.data_emissao,
      bom_para: cheque.bom_para_anotado,
      data_efetiva: validacao.data_efetiva,
      nominal: cheque.nominal,
      cidade: cheque.cidade_praca,
      assinatura_presente: cheque.assinatura_presente,
      rasuras: cheque.rasuras_detectadas,
      confianca: cheque.confianca_por_campo,
      observacoes: cheque.observacoes,
      status: validacao.status,
      alertas: validacao.alertas,
    }
  })

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
