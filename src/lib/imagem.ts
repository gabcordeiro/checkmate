/**
 * Pré-processamento das fotos no navegador. Roda só no client.
 *
 * A regra mais importante do produto está aqui: foto com menos de 1000px no
 * lado menor é REJEITADA. Não é limitação, é feature — nenhum modelo recupera
 * pixel que não existe, e um CMC7 chutado a partir de foto de 400px custa mais
 * caro que refotografar.
 */

export const LADO_MINIMO = 1000

/** Acima disso a foto só engorda o upload sem melhorar a leitura. */
export const LADO_MAXIMO = 2400

export const MENSAGEM_FOTO_PEQUENA =
  'Foto pequena demais para leitura confiável. Fotografe 1 cheque por vez, preenchendo a tela, com boa luz.'

export interface Dimensoes {
  largura: number
  altura: number
}

export async function lerDimensoes(arquivo: File): Promise<Dimensoes | null> {
  const url = URL.createObjectURL(arquivo)
  try {
    const imagem = await new Promise<HTMLImageElement | null>((resolve) => {
      const elemento = new Image()
      elemento.onload = () => resolve(elemento)
      elemento.onerror = () => resolve(null)
      elemento.src = url
    })
    if (!imagem) return null
    return { largura: imagem.naturalWidth, altura: imagem.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function ladoMenor(dimensoes: Dimensoes): number {
  return Math.min(dimensoes.largura, dimensoes.altura)
}

export interface ImagemPreparada {
  blob: Blob
  mimeType: string
  dimensoes: Dimensoes
}

/**
 * Reduz a foto para no máximo LADO_MAXIMO no lado maior e converte para JPEG.
 * Se a conversão falhar (formato exótico, canvas bloqueado), devolve o arquivo
 * original — perder o upload seria pior que subir um arquivo grande.
 */
export async function prepararParaUpload(
  arquivo: File,
  dimensoes: Dimensoes,
): Promise<ImagemPreparada> {
  const original: ImagemPreparada = {
    blob: arquivo,
    mimeType: arquivo.type || 'image/jpeg',
    dimensoes,
  }

  const ladoMaior = Math.max(dimensoes.largura, dimensoes.altura)
  if (ladoMaior <= LADO_MAXIMO && arquivo.size < 4_000_000) return original

  try {
    const fator = Math.min(1, LADO_MAXIMO / ladoMaior)
    const largura = Math.round(dimensoes.largura * fator)
    const altura = Math.round(dimensoes.altura * fator)

    const bitmap = await createImageBitmap(arquivo)
    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = altura
    const contexto = canvas.getContext('2d')
    if (!contexto) return original
    contexto.drawImage(bitmap, 0, 0, largura, altura)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
    })
    if (!blob) return original

    return { blob, mimeType: 'image/jpeg', dimensoes: { largura, altura } }
  } catch {
    return original
  }
}

export function extensaoDoMime(mimeType: string): string {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('heic') || mimeType.includes('heif')) return 'heic'
  return 'jpg'
}
