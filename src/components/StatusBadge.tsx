import type { StatusCheque } from '@/lib/validation/types'

const ESTILOS: Record<StatusCheque, { classe: string; emoji: string; texto: string }> = {
  ok: { classe: 'border-ok-border bg-ok-bg text-ok-text', emoji: '🟢', texto: 'OK' },
  conferir: {
    classe: 'border-conferir-border bg-conferir-bg text-conferir-text',
    emoji: '🟡',
    texto: 'Conferir',
  },
  vermelho: {
    classe: 'border-devolve-border bg-devolve-bg text-devolve-text',
    emoji: '🔴',
    texto: 'Banco pode devolver',
  },
}

export default function StatusBadge({
  status,
  compacto = false,
}: {
  status: StatusCheque
  compacto?: boolean
}) {
  const estilo = ESTILOS[status] ?? ESTILOS.conferir
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${estilo.classe}`}
    >
      <span aria-hidden>{estilo.emoji}</span>
      {!compacto && estilo.texto}
    </span>
  )
}
