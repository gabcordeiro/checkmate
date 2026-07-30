'use client'

/**
 * Checkbox de "lançado no sistema" com o traço do check sendo desenhado
 * (transição "Checkbox check" do transitions.dev). É a marcação que a operadora
 * faz cheque por cheque: o desenho do traço é a confirmação de que pegou.
 *
 * `--check-len: 15` é o comprimento do path arredondado para cima, para o traço
 * não faltar nem sobrar; transicionar o offset faz o desmarcar voltar limpo.
 */
export default function CheckLancado({
  marcado,
  onAlternar,
  desabilitado = false,
  rotulo = 'lançado',
}: {
  marcado: boolean
  onAlternar: (proximo: boolean) => void
  desabilitado?: boolean
  rotulo?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcado}
      aria-label={marcado ? `Desmarcar ${rotulo}` : `Marcar como ${rotulo}`}
      disabled={desabilitado}
      onClick={() => onAlternar(!marcado)}
      // `t-check` precisa ficar no mesmo elemento que carrega o aria-checked:
      // é o atributo que a regra CSS usa para soltar o traço.
      className="t-check group flex items-center gap-1.5 whitespace-nowrap text-xs text-tinta-600 disabled:opacity-50"
      style={{ ['--check-len' as string]: '15' }}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
          marcado
            ? 'border-ok-text bg-ok-text'
            : 'border-tinta-300 bg-white group-hover:border-tinta-400'
        }`}
      >
        <svg viewBox="0 0 10.1668 10.1668" className="h-2.5 w-2.5" aria-hidden>
          <path
            d="M1 5.52L3.92 9.17L9.17 1"
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {rotulo}
    </button>
  )
}
