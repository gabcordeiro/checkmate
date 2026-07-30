/**
 * Copiar para a área de transferência. A ação mais repetida do app: a operadora
 * copia daqui e cola no sistema da empresa, dezenas de vezes por lote.
 *
 * Precisa funcionar por botão E por atalho de teclado, então mora fora do
 * componente.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
    // Safari sem permissão de clipboard: caminho antigo.
    const area = document.createElement('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
