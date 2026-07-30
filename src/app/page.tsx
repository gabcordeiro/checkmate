import Link from 'next/link'
import { redirect } from 'next/navigation'
import Logo from '@/components/Logo'
import { criarClienteServidor, supabaseConfiguradoServidor } from '@/lib/supabase/server'

const PONTOS = [
  {
    icone: '🔢',
    titulo: 'CMC7 legível, com verificador',
    texto:
      'Cada bloco tem o dígito verificador recalculado. Quando um dígito está ambíguo (3 ou 8?), o app testa as duas leituras e mostra qual delas fecha o verificador — em vez de você descobrir por tentativa e erro no sistema.',
  },
  {
    icone: '🗂️',
    titulo: 'Lote organizado por emitente',
    texto:
      'Cheques agrupados por quem emitiu, em ordem de data efetiva, com subtotal por emitente e total do lote. Um clique copia o CMC7.',
  },
  {
    icone: '🔴',
    titulo: 'Alerta do que o banco devolve',
    texto:
      'Extenso divergente do numérico, "bom para" anterior à data do cheque, falta de assinatura, rasura em data/nominal/valor. Vermelho é prejuízo; amarelo é conferir.',
  },
]

export default async function Home() {
  if (supabaseConfiguradoServidor) {
    const supabase = await criarClienteServidor()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) redirect('/lotes')
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-20">
      <div className="t-reveal">
        <Logo tamanho={40} comNome />
      </div>

      <h1 className="t-reveal t-reveal-1 mt-8 text-3xl font-semibold leading-[1.15] tracking-tight sm:text-[2.75rem]">
        <span className="texto-gradiente">Confira o lote de cheques</span>
        <br />
        antes de lançar.
      </h1>

      <p className="t-reveal t-reveal-2 mt-5 text-lg leading-relaxed text-tinta-600">
        Fotografe, e o app lê o CMC7, organiza os cheques por emitente e avisa o que o banco
        devolveria. A decisão continua sendo sua — a ferramenta é conferente, não lançadora.
      </p>

      <div className="t-reveal t-reveal-3 mt-8 flex flex-wrap items-center gap-3">
        <Link href="/login" className="btn-primario">
          Entrar
        </Link>
        <span className="text-xs text-tinta-500">Google ou e-mail e senha</span>
      </div>

      <div className="mt-14 space-y-4">
        {PONTOS.map((ponto, indice) => (
          <div
            key={ponto.titulo}
            className={`cartao t-reveal t-reveal-${indice + 2} flex gap-4 p-5`}
          >
            <span
              aria-hidden
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-marca-50 text-base"
            >
              {ponto.icone}
            </span>
            <div>
              <h2 className="font-semibold tracking-tight">{ponto.titulo}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-tinta-600">{ponto.texto}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-12 border-l-2 border-marca-200 pl-4 text-sm leading-relaxed text-tinta-500">
        Foto pequena não é lida com confiança: o app avisa quando a imagem tem menos de 1000px no
        lado menor e deixa você escolher entre mandar outra ou seguir com o alerta registrado.
        Nenhum modelo recupera pixel que não existe.
      </p>
    </main>
  )
}
