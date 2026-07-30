'use client'

import { useState } from 'react'
import { formatarBRL } from '@/lib/format'
import { agruparPorEmitente, resumirLote } from '@/lib/lote'
import { formatarDataBr } from '@/lib/validation/datas'
import type { ChequeRow } from '@/lib/supabase/types'

/**
 * PDF simples de conferência: a folha que a operadora leva para o lado do
 * sistema. Sem gráfico, sem enfeite — emitente, data, valor, CMC7 e alerta.
 */
export default function BotaoExportarPdf({
  cheques,
  nomeLote,
  criadoEm,
}: {
  cheques: ChequeRow[]
  nomeLote: string | null
  criadoEm: string
}) {
  const [gerando, setGerando] = useState(false)

  async function gerar() {
    setGerando(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const margem = 40
      const larguraUtil = doc.internal.pageSize.getWidth() - margem * 2
      const alturaPagina = doc.internal.pageSize.getHeight()
      let y = margem

      const novaPaginaSePreciso = (altura: number) => {
        if (y + altura > alturaPagina - margem) {
          doc.addPage()
          y = margem
        }
      }

      const resumo = resumirLote(cheques)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.text(nomeLote?.trim() || 'Lote de cheques', margem, y)
      y += 18

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(
        `Criado em ${formatarDataBr(criadoEm.slice(0, 10))} · ${resumo.quantidade} cheques · ${formatarBRL(
          resumo.total,
        )} · ${resumo.vermelhos} alertas vermelhos · ${resumo.amarelos} amarelos`,
        margem,
        y,
      )
      y += 8
      doc.setDrawColor(200)
      doc.line(margem, y, margem + larguraUtil, y)
      y += 14

      for (const grupo of agruparPorEmitente(cheques)) {
        novaPaginaSePreciso(60)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text(grupo.rotulo, margem, y)
        doc.text(formatarBRL(grupo.subtotal), margem + larguraUtil, y, { align: 'right' })
        y += 14

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)

        for (const cheque of grupo.cheques) {
          const alertas = (cheque.alertas ?? []).map(
            (a) => `${a.nivel === 'vermelho' ? '[X]' : '[!]'} ${a.titulo}`,
          )
          novaPaginaSePreciso(14 + alertas.length * 10)

          const linha = [
            `nº ${cheque.numero_cheque ?? '—'}`,
            formatarDataBr(cheque.data_efetiva ?? cheque.data_emissao),
            formatarBRL(cheque.valor_numerico === null ? null : Number(cheque.valor_numerico)),
            cheque.cmc7_completo ?? 'CMC7 ilegível',
          ].join('   ')

          doc.text(linha, margem + 10, y, { maxWidth: larguraUtil - 60 })
          doc.text(cheque.lancado ? 'lançado' : '☐', margem + larguraUtil, y, { align: 'right' })
          y += 11

          for (const alerta of alertas) {
            doc.text(alerta, margem + 20, y, { maxWidth: larguraUtil - 30 })
            y += 10
          }
          y += 2
        }

        y += 8
      }

      novaPaginaSePreciso(30)
      doc.setDrawColor(200)
      doc.line(margem, y, margem + larguraUtil, y)
      y += 14
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.text(`Total do lote: ${formatarBRL(resumo.total)}`, margem, y)

      const base = (nomeLote || 'lote')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .toLowerCase()
      doc.save(`${base || 'lote'}-${criadoEm.slice(0, 10)}.pdf`)
    } finally {
      setGerando(false)
    }
  }

  return (
    <button type="button" onClick={gerar} disabled={gerando} className="btn-secundario px-3 py-1.5 text-xs">
      {gerando ? 'Gerando…' : 'Exportar PDF'}
    </button>
  )
}
