import Link from 'next/link'
import { redirect } from 'next/navigation'
import { criarClienteServidor, supabaseConfiguradoServidor } from '@/lib/supabase/server'

const PONTOS = [
  {
    titulo: 'CMC7 legível, com verificador',
    texto:
      'Cada bloco tem o dígito verificador recalculado. Quando um dígito está ambíguo (3 ou 8?), o app testa as duas leituras e mostra qual delas fecha o verificador — em vez de você descobrir por tentativa e erro no sistema.',
  },
  {
    titulo: 'Lote organizado por emitente',
    texto:
      'Cheques agrupados por quem emitiu, em ordem de data efetiva, com subtotal por emitente e total do lote. Um clique copia o CMC7.',
  },
  {
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
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        ChequeCerto
      </p>
      <h1 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">
        Confira o lote de cheques antes de lançar.
      </h1>
      <p className="mt-4 text-lg text-slate-600">
        Fotografe, e o app lê o CMC7, organiza os cheques por emitente e avisa o que o banco
        devolveria. A decisão continua sendo sua — a ferramenta é conferente, não lançadora.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/login" className="btn-primario">
          Entrar com Google
        </Link>
      </div>

      <div className="mt-12 space-y-5">
        {PONTOS.map((ponto) => (
          <div key={ponto.titulo} className="cartao p-5">
            <h2 className="font-semibold">{ponto.titulo}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{ponto.texto}</p>
          </div>
        ))}
      </div>

      <p className="mt-10 text-sm text-slate-500">
        Foto pequena não é lida: o app rejeita imagem com menos de 1000px no lado menor e pede
        para refotografar. Nenhum modelo recupera pixel que não existe.
      </p>
    </main>
  )
}
