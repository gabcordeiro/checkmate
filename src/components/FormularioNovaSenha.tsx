'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import CaixaErro from './CaixaErro'
import { criarClienteBrowser } from '@/lib/supabase/client'
import { requisitosDaSenha, senhaValida, traduzirErroAuth } from '@/lib/authErros'

/**
 * Define uma senha nova. Serve para os dois casos:
 *   - quem chegou pelo link de "esqueci minha senha" (já entrou com a sessão
 *     que o link criou);
 *   - quem está logada e quer trocar a senha.
 */
export default function FormularioNovaSenha({ email }: { email: string | null }) {
  const router = useRouter()
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)

  const requisitos = requisitosDaSenha(senha)

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)

    if (!senhaValida(senha)) {
      setErro('A senha ainda não atende aos requisitos listados abaixo.')
      return
    }
    if (senha !== confirmacao) {
      setErro('As senhas não coincidem.')
      return
    }

    setEnviando(true)
    const supabase = criarClienteBrowser()
    const { error } = await supabase.auth.updateUser({ password: senha })
    setEnviando(false)

    if (error) {
      setErro(traduzirErroAuth(error.message))
      return
    }
    setPronto(true)
    router.refresh()
  }

  if (pronto) {
    return (
      <div className="mt-6">
        <p className="rounded-lg border border-ok-border bg-ok-bg px-3 py-2 text-sm text-ok-text">
          Senha alterada. Você já está entrando com ela.
        </p>
        <button
          type="button"
          onClick={() => router.replace('/lotes')}
          className="btn-primario mt-4 w-full"
        >
          Ir para os lotes
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className="mt-6 space-y-3">
      {email && (
        <p className="text-sm text-tinta-600">
          Definindo a senha de <strong className="font-medium">{email}</strong>.
        </p>
      )}

      <label className="block">
        <span className="rotulo">Senha nova</span>
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="new-password"
          required
          autoFocus
          className="campo"
        />
      </label>

      <label className="block">
        <span className="rotulo">Repita a senha nova</span>
        <input
          type="password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          autoComplete="new-password"
          required
          className="campo"
        />
      </label>

      <ul className="space-y-0.5 text-xs">
        {requisitos.map((requisito) => (
          <li key={requisito.rotulo} className={requisito.ok ? 'text-ok-text' : 'text-tinta-500'}>
            <span aria-hidden>{requisito.ok ? '✓' : '·'}</span> {requisito.rotulo}
          </li>
        ))}
      </ul>

      <CaixaErro mensagem={erro} />

      <button type="submit" disabled={enviando} className="btn-primario w-full">
        {enviando ? 'Salvando…' : 'Salvar senha'}
      </button>
    </form>
  )
}
