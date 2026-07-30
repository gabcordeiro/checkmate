'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { criarClienteBrowser, supabaseConfigurado } from '@/lib/supabase/client'
import { MENSAGEM_SETUP } from '@/lib/supabase/env'
import { requisitosDaSenha, senhaValida, traduzirErroAuth } from '@/lib/authErros'

/**
 * Entrada no app: Google OU e-mail e senha.
 *
 * O Google é o caminho rápido para quem já tem conta Google da empresa; o
 * e-mail e senha existe porque não toda operadora tem — e obrigar a criar uma
 * conta Google só para usar a ferramenta é atrito que não paga nada.
 */

type Modo = 'entrar' | 'criar' | 'recuperar'

const TITULOS: Record<Modo, { titulo: string; texto: string; acao: string }> = {
  entrar: {
    titulo: 'Entrar',
    texto: 'Cada usuário vê apenas os próprios lotes.',
    acao: 'Entrar',
  },
  criar: {
    titulo: 'Criar conta',
    texto: 'Você vai receber um e-mail para confirmar o endereço.',
    acao: 'Criar conta',
  },
  recuperar: {
    titulo: 'Esqueci minha senha',
    texto: 'Enviamos um link para você definir uma senha nova.',
    acao: 'Enviar link',
  },
}

export default function FormularioLogin() {
  const router = useRouter()
  const params = useSearchParams()
  const proximo = params.get('proximo') || '/lotes'

  const [modo, setModo] = useState<Modo>('entrar')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  // Erro devolvido pela rota /auth/callback quando o OAuth falha.
  const [erro, setErro] = useState<string | null>(params.get('erro'))
  const [aviso, setAviso] = useState<string | null>(null)

  const requisitos = requisitosDaSenha(senha)

  function trocarModo(proximoModo: Modo) {
    setModo(proximoModo)
    setErro(null)
    setAviso(null)
    setSenha('')
    setConfirmacao('')
  }

  function semConfiguracao(): boolean {
    if (supabaseConfigurado) return false
    setErro(MENSAGEM_SETUP)
    return true
  }

  async function entrarComGoogle() {
    setErro(null)
    setAviso(null)
    if (semConfiguracao()) return

    setEnviando(true)
    const supabase = criarClienteBrowser()
    const destino = new URL('/auth/callback', window.location.origin)
    destino.searchParams.set('proximo', proximo)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: destino.toString() },
    })
    if (error) {
      setErro(traduzirErroAuth(error.message))
      setEnviando(false)
    }
    // Sucesso não desliga o "enviando": o navegador já está saindo para o Google.
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault()
    setErro(null)
    setAviso(null)
    if (semConfiguracao()) return

    const emailLimpo = email.trim().toLowerCase()
    if (!emailLimpo) {
      setErro('Informe seu e-mail.')
      return
    }

    const supabase = criarClienteBrowser()
    setEnviando(true)

    try {
      if (modo === 'entrar') {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailLimpo,
          password: senha,
        })
        if (error) throw error
        // O middleware cuida do resto; refresh para o servidor ver o cookie.
        router.replace(proximo.startsWith('/') ? proximo : '/lotes')
        router.refresh()
        return
      }

      if (modo === 'criar') {
        if (!senhaValida(senha)) {
          setErro('A senha ainda não atende aos requisitos listados abaixo.')
          return
        }
        if (senha !== confirmacao) {
          setErro('As senhas não coincidem.')
          return
        }

        const destino = new URL('/auth/callback', window.location.origin)
        destino.searchParams.set('proximo', proximo)

        const { data, error } = await supabase.auth.signUp({
          email: emailLimpo,
          password: senha,
          options: {
            emailRedirectTo: destino.toString(),
            // Alimenta o trigger que cria a linha em `profiles`.
            data: nome.trim() ? { full_name: nome.trim() } : undefined,
          },
        })
        if (error) throw error

        // Com confirmação de e-mail ligada (padrão), não vem sessão.
        if (data.session) {
          router.replace(proximo.startsWith('/') ? proximo : '/lotes')
          router.refresh()
          return
        }
        setAviso(
          `Conta criada. Enviamos um link de confirmação para ${emailLimpo} — abra o e-mail e clique no link para entrar. Confira também o lixo eletrônico.`,
        )
        setModo('entrar')
        setSenha('')
        setConfirmacao('')
        return
      }

      // recuperar
      const destino = new URL('/auth/callback', window.location.origin)
      destino.searchParams.set('proximo', '/nova-senha')

      const { error } = await supabase.auth.resetPasswordForEmail(emailLimpo, {
        redirectTo: destino.toString(),
      })
      if (error) throw error
      setAviso(
        `Se existe uma conta com ${emailLimpo}, o link para definir uma senha nova já está a caminho. Confira também o lixo eletrônico.`,
      )
      setModo('entrar')
    } catch (e) {
      setErro(traduzirErroAuth(e instanceof Error ? e.message : null))
    } finally {
      setEnviando(false)
    }
  }

  const { titulo, texto, acao } = TITULOS[modo]

  return (
    <>
      <h1 className="mt-2 text-2xl font-semibold">{titulo}</h1>
      <p className="mt-2 text-sm text-slate-600">{texto}</p>

      <button
        type="button"
        onClick={entrarComGoogle}
        disabled={enviando}
        className="btn-secundario mt-6 w-full"
      >
        <svg viewBox="0 0 18 18" aria-hidden className="h-4 w-4">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
          />
        </svg>
        Entrar com Google
      </button>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-xs uppercase tracking-wide text-slate-400">ou</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <form onSubmit={enviar} className="space-y-3">
        {modo === 'criar' && (
          <label className="block">
            <span className="rotulo">Seu nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoComplete="name"
              placeholder="Amanda"
              className="campo"
            />
          </label>
        )}

        <label className="block">
          <span className="rotulo">E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            inputMode="email"
            className="campo"
          />
        </label>

        {modo !== 'recuperar' && (
          <label className="block">
            <span className="rotulo">Senha</span>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
              required
              className="campo"
            />
          </label>
        )}

        {modo === 'criar' && (
          <>
            <label className="block">
              <span className="rotulo">Repita a senha</span>
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
                <li
                  key={requisito.rotulo}
                  className={requisito.ok ? 'text-ok-text' : 'text-slate-500'}
                >
                  <span aria-hidden>{requisito.ok ? '✓' : '·'}</span> {requisito.rotulo}
                </li>
              ))}
            </ul>
          </>
        )}

        <button type="submit" disabled={enviando} className="btn-primario w-full">
          {enviando ? 'Aguarde…' : acao}
        </button>
      </form>

      {erro && (
        <p className="mt-4 rounded-lg border border-devolve-border bg-devolve-bg px-3 py-2 text-sm leading-relaxed text-devolve-text">
          {erro}
        </p>
      )}

      {aviso && (
        <p className="mt-4 rounded-lg border border-ok-border bg-ok-bg px-3 py-2 text-sm leading-relaxed text-ok-text">
          {aviso}
        </p>
      )}

      <div className="mt-5 space-y-1.5 text-sm">
        {modo === 'entrar' && (
          <>
            <p>
              <button
                type="button"
                onClick={() => trocarModo('criar')}
                className="text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
              >
                Não tenho conta — criar uma
              </button>
            </p>
            <p>
              <button
                type="button"
                onClick={() => trocarModo('recuperar')}
                className="text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
              >
                Esqueci minha senha
              </button>
            </p>
          </>
        )}
        {modo !== 'entrar' && (
          <p>
            <button
              type="button"
              onClick={() => trocarModo('entrar')}
              className="text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
            >
              ← Já tenho conta, quero entrar
            </button>
          </p>
        )}
      </div>

      {!supabaseConfigurado && (
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Setup: no Supabase, habilite os providers Email e Google em Authentication → Providers,
          e configure Site URL e Redirect URLs em Authentication → URL Configuration.
        </p>
      )}
    </>
  )
}
