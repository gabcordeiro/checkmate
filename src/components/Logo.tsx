/**
 * Marca do Cheque Mate.
 *
 * O nome é uma brincadeira com xadrez, então o símbolo junta as duas leituras:
 * a silhueta de uma peça (a base e o colarinho de um rei) com o traço de um
 * check saindo dela. Lido em 20px continua sendo "conferido"; lido em 40px
 * aparece a peça.
 */
export default function Logo({
  tamanho = 32,
  comNome = false,
}: {
  tamanho?: number
  comNome?: boolean
}) {
  const marca = (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-xl bg-marca-gradiente shadow-botao"
      style={{ width: tamanho, height: tamanho }}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        style={{ width: tamanho * 0.62, height: tamanho * 0.62 }}
      >
        {/* Base da peça */}
        <path
          d="M6.5 19.5h11"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.55"
        />
        {/* Colarinho */}
        <path
          d="M8 16.2h8"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.35"
        />
        {/* O check, que é o assunto */}
        <path
          d="M5.8 9.9l4 4.2L18.4 4.6"
          stroke="white"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )

  if (!comNome) return marca

  return (
    <span className="inline-flex items-center gap-2.5">
      {marca}
      <span className="text-[15px] font-semibold tracking-tight text-tinta-900">
        Cheque<span className="text-marca-600">Mate</span>
      </span>
    </span>
  )
}
