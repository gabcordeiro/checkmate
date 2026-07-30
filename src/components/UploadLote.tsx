'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarClienteBrowser } from '@/lib/supabase/client'
import {
  extensaoDoMime,
  ladoMenor,
  lerDimensoes,
  LADO_MINIMO,
  MENSAGEM_FOTO_PEQUENA,
  prepararParaUpload,
  type Dimensoes,
} from '@/lib/imagem'

type Situacao = 'aguardando' | 'enviando' | 'lendo' | 'pronto' | 'rejeitado' | 'erro'

interface ItemFila {
  id: string
  arquivo: File
  previa: string
  situacao: Situacao
  mensagem?: string
  dimensoes?: Dimensoes
  chequesEncontrados?: number
}

function idLocal() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function UploadLote({ usuarioId }: { usuarioId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState('')
  const [fila, setFila] = useState<ItemFila[]>([])
  const [processando, setProcessando] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [arrastando, setArrastando] = useState(false)

  const adicionar = useCallback(async (arquivos: FileList | File[]) => {
    const lista = Array.from(arquivos).filter((a) => a.type.startsWith('image/'))
    if (lista.length === 0) return

    const novos: ItemFila[] = lista.map((arquivo) => ({
      id: idLocal(),
      arquivo,
      previa: URL.createObjectURL(arquivo),
      situacao: 'aguardando',
    }))
    setFila((atual) => [...atual, ...novos])

    // Valida resolução assim que o arquivo entra, para a operadora refotografar
    // antes de gastar tempo (e chamada de API) com uma foto que não serve.
    for (const item of novos) {
      const dimensoes = await lerDimensoes(item.arquivo)
      setFila((atual) =>
        atual.map((f) => {
          if (f.id !== item.id) return f
          if (!dimensoes) {
            return {
              ...f,
              situacao: 'aguardando',
              mensagem: 'Não foi possível medir a resolução desta foto. Confira o resultado com atenção.',
            }
          }
          if (ladoMenor(dimensoes) < LADO_MINIMO) {
            return { ...f, situacao: 'rejeitado', dimensoes, mensagem: MENSAGEM_FOTO_PEQUENA }
          }
          return { ...f, situacao: 'aguardando', dimensoes, mensagem: undefined }
        }),
      )
    }
  }, [])

  function remover(id: string) {
    setFila((atual) => {
      const item = atual.find((f) => f.id === id)
      if (item) URL.revokeObjectURL(item.previa)
      return atual.filter((f) => f.id !== id)
    })
  }

  const validos = fila.filter((f) => f.situacao !== 'rejeitado')

  async function processar() {
    if (validos.length === 0 || processando) return
    setProcessando(true)
    setErroGeral(null)

    const supabase = criarClienteBrowser()

    // 1. Cria o lote. RLS exige owner_id = auth.uid().
    const { data: lote, error: erroLote } = await supabase
      .from('batches')
      .insert({ owner_id: usuarioId, nome: nome.trim() || null })
      .select('id')
      .single()

    if (erroLote || !lote) {
      setErroGeral(
        erroLote?.message ?? 'Não foi possível criar o lote. Verifique se as migrations foram aplicadas.',
      )
      setProcessando(false)
      return
    }

    let algumSucesso = false

    for (const item of validos) {
      if (item.situacao === 'pronto') continue

      try {
        setFila((atual) =>
          atual.map((f) => (f.id === item.id ? { ...f, situacao: 'enviando', mensagem: undefined } : f)),
        )

        const dimensoes = item.dimensoes ?? (await lerDimensoes(item.arquivo))
        const preparada = await prepararParaUpload(
          item.arquivo,
          dimensoes ?? { largura: 0, altura: 0 },
        )

        // 2. Sobe para o bucket privado. O prefixo é o uid: é o que a policy de
        //    Storage confere.
        const caminho = `${usuarioId}/${lote.id}/${idLocal()}.${extensaoDoMime(preparada.mimeType)}`
        const { error: erroUpload } = await supabase.storage
          .from('cheques')
          .upload(caminho, preparada.blob, { contentType: preparada.mimeType, upsert: false })

        if (erroUpload) throw new Error(erroUpload.message)

        setFila((atual) => atual.map((f) => (f.id === item.id ? { ...f, situacao: 'lendo' } : f)))

        // 3. A extração roda no servidor (a chave da IA nunca vem para o browser).
        const resposta = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch_id: lote.id, storage_path: caminho }),
        })
        const corpo = (await resposta.json().catch(() => ({}))) as {
          cheques?: number
          error?: string
        }
        if (!resposta.ok) throw new Error(corpo.error || `Falha na extração (${resposta.status}).`)

        algumSucesso = true
        setFila((atual) =>
          atual.map((f) =>
            f.id === item.id
              ? {
                  ...f,
                  situacao: 'pronto',
                  chequesEncontrados: corpo.cheques ?? 0,
                  mensagem:
                    (corpo.cheques ?? 0) > 1
                      ? `${corpo.cheques} cheques nesta foto. Com cheques empilhados a confiança da leitura cai — confira campo por campo.`
                      : (corpo.cheques ?? 0) === 0
                        ? 'Nenhum cheque reconhecido nesta foto.'
                        : undefined,
                }
              : f,
          ),
        )
      } catch (erro) {
        setFila((atual) =>
          atual.map((f) =>
            f.id === item.id
              ? {
                  ...f,
                  situacao: 'erro',
                  mensagem: erro instanceof Error ? erro.message : 'Erro inesperado.',
                }
              : f,
          ),
        )
      }
    }

    setProcessando(false)

    if (algumSucesso) router.push(`/lotes/${lote.id}`)
    else setErroGeral('Nenhuma foto pôde ser processada. Veja o erro em cada item acima.')
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="nome-lote" className="rotulo">
          Nome do lote (opcional)
        </label>
        <input
          id="nome-lote"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Operação Daniel 29/07"
          className="campo"
        />
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastando(false)
          void adicionar(e.dataTransfer.files)
        }}
        className={`rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
          arrastando ? 'border-slate-500 bg-slate-100' : 'border-slate-300 bg-white'
        }`}
      >
        <p className="text-sm font-medium">Arraste as fotos aqui</p>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
          1 cheque por foto, preenchendo o quadro, com boa luz e a tarja do CMC7 nítida. Fotos com
          menos de {LADO_MINIMO}px no lado menor são recusadas.
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn-secundario mt-4"
        >
          Escolher fotos ou usar a câmera
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void adicionar(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {fila.length > 0 && (
        <ul className="space-y-2">
          {fila.map((item) => (
            <li
              key={item.id}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${
                item.situacao === 'rejeitado' || item.situacao === 'erro'
                  ? 'border-devolve-border bg-devolve-bg'
                  : item.situacao === 'pronto'
                    ? 'border-ok-border bg-ok-bg'
                    : 'border-slate-200 bg-white'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.previa}
                alt=""
                className="h-12 w-20 shrink-0 rounded border border-slate-200 object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.arquivo.name}</p>
                <p className="text-xs text-slate-500">
                  {item.dimensoes
                    ? `${item.dimensoes.largura}×${item.dimensoes.altura}px`
                    : 'medindo…'}
                  {' · '}
                  {
                    {
                      aguardando: 'pronta para enviar',
                      enviando: 'enviando…',
                      lendo: 'lendo o cheque…',
                      pronto: `${item.chequesEncontrados ?? 0} cheque(s) extraído(s)`,
                      rejeitado: 'recusada',
                      erro: 'erro',
                    }[item.situacao]
                  }
                </p>
                {item.mensagem && (
                  <p
                    className={`mt-1 text-xs leading-relaxed ${
                      item.situacao === 'rejeitado' || item.situacao === 'erro'
                        ? 'text-devolve-text'
                        : 'text-conferir-text'
                    }`}
                  >
                    {item.mensagem}
                  </p>
                )}
              </div>
              {!processando && (
                <button
                  type="button"
                  onClick={() => remover(item.id)}
                  className="shrink-0 text-xs text-slate-400 hover:text-slate-700"
                >
                  remover
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {erroGeral && (
        <p className="rounded-lg border border-devolve-border bg-devolve-bg px-3 py-2 text-sm text-devolve-text">
          {erroGeral}
        </p>
      )}

      <button
        type="button"
        onClick={processar}
        disabled={processando || validos.length === 0}
        className="btn-primario w-full sm:w-auto"
      >
        {processando
          ? 'Processando…'
          : `Processar ${validos.length || ''} ${validos.length === 1 ? 'foto' : 'fotos'}`.trim()}
      </button>
    </div>
  )
}
