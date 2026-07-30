/**
 * Stat tile — um número que a operadora precisa ler de relance.
 *
 * É a forma certa para "um valor atual": um gráfico de uma barra só seria pior.
 * O texto nunca veste a cor do dado; quando o tile é crítico, quem carrega o
 * status é a marca (a faixa lateral) mais o ícone e o rótulo — nunca a cor só.
 */

import NumeroPopIn from './NumeroPopIn'

export type TomTile = 'neutro' | 'critico' | 'atencao' | 'bom'

const FAIXA: Record<TomTile, string> = {
  neutro: 'bg-slate-300',
  critico: 'bg-marca-risco',
  atencao: 'bg-conferir-border',
  bom: 'bg-ok-border',
}

export default function StatTile({
  rotulo,
  valor,
  apoio,
  tom = 'neutro',
  icone,
  destaque = false,
  className = '',
  animarValor = false,
}: {
  rotulo: string
  valor: string
  apoio?: string
  tom?: TomTile
  icone?: string
  destaque?: boolean
  className?: string
  /** Entrada caractere por caractere. Só para o número que puxa a atenção. */
  animarValor?: boolean
}) {
  return (
    <div
      className={`relative flex flex-col gap-0.5 overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3 ${className}`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${FAIXA[tom]}`} />
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {icone && <span aria-hidden>{icone}</span>}
        {rotulo}
      </span>
      {/* Número grande usa os algarismos proporcionais da fonte: `tabular-nums`
          dá a todo dígito a largura do zero e deixa o valor solto no tamanho
          de display. Tabular fica para colunas que precisam alinhar. */}
      {animarValor ? (
        <NumeroPopIn
          valor={valor}
          className={`font-semibold text-slate-900 ${
            destaque ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'
          }`}
        />
      ) : (
        <span
          className={`font-semibold text-slate-900 ${
            destaque ? 'text-xl sm:text-2xl' : 'text-base sm:text-lg'
          }`}
        >
          {valor}
        </span>
      )}
      {apoio && <span className="text-xs leading-snug text-slate-500">{apoio}</span>}
    </div>
  )
}
