/**
 * Mensagens do Supabase Auth em português.
 *
 * A operadora não é técnica: "Invalid login credentials" não diz nada, e um
 * erro que ela não entende vira um telefonema. Cada mensagem aqui diz o que
 * aconteceu E o que fazer.
 */

const TRADUCOES: Array<[RegExp, string]> = [
  [
    /invalid login credentials/i,
    'E-mail ou senha incorretos. Confira os dois — se esqueceu a senha, use "Esqueci minha senha".',
  ],
  [
    /email not confirmed/i,
    'Você ainda não confirmou o e-mail. Procure a mensagem que enviamos (veja também o lixo eletrônico) e clique no link.',
  ],
  [
    /user already registered|already been registered/i,
    'Já existe uma conta com esse e-mail. Entre normalmente ou use "Esqueci minha senha".',
  ],
  [
    /password should be at least/i,
    'A senha é curta demais. Use pelo menos 8 caracteres.',
  ],
  [
    /new password should be different/i,
    'A nova senha precisa ser diferente da anterior.',
  ],
  [
    /unable to validate email address|invalid format/i,
    'E-mail inválido. Confira se não faltou o @ ou o domínio.',
  ],
  [
    /for security purposes, you can only request this after (\d+)/i,
    'Aguarde alguns segundos antes de tentar de novo.',
  ],
  [
    /email rate limit exceeded|over_email_send_rate_limit/i,
    'Muitos e-mails enviados em pouco tempo. Espere alguns minutos e tente de novo.',
  ],
  [
    /signups not allowed|email signups are disabled|email logins are disabled/i,
    'O cadastro por e-mail está desativado no projeto. Habilite em Authentication → Providers → Email, no Supabase.',
  ],
  [
    /token has expired or is invalid|invalid flow state|code verifier/i,
    'Este link expirou ou já foi usado. Peça um novo.',
  ],
  [/user not found/i, 'Não encontramos uma conta com esse e-mail.'],
  [
    /provider is not enabled/i,
    'Esse provedor de login não está habilitado no Supabase (Authentication → Providers).',
  ],
  [
    /redirect_to.*not allowed|invalid redirect/i,
    'A URL de retorno não está liberada no Supabase (Authentication → URL Configuration → Redirect URLs).',
  ],
]

export function traduzirErroAuth(mensagem: string | null | undefined): string {
  if (!mensagem) return 'Não foi possível concluir. Tente de novo.'
  for (const [padrao, traducao] of TRADUCOES) {
    if (padrao.test(mensagem)) return traducao
  }
  return mensagem
}

export interface RequisitoSenha {
  rotulo: string
  ok: boolean
}

/** Requisitos mínimos, checados só no cadastro e na troca de senha. */
export function requisitosDaSenha(senha: string): RequisitoSenha[] {
  return [
    { rotulo: 'Pelo menos 8 caracteres', ok: senha.length >= 8 },
    { rotulo: 'Uma letra maiúscula', ok: /[A-Z]/.test(senha) },
    { rotulo: 'Uma letra minúscula', ok: /[a-z]/.test(senha) },
    { rotulo: 'Um número ou símbolo', ok: /[^A-Za-z]/.test(senha) },
  ]
}

export function senhaValida(senha: string): boolean {
  return requisitosDaSenha(senha).every((r) => r.ok)
}
