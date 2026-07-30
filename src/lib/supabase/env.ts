/**
 * Resolve as credenciais do Supabase aceitando os dois nomes de chave.
 *
 * O Supabase renomeou as chaves de API: projetos novos entregam
 * `sb_publishable_...` (rotulada "publishable key") e `sb_secret_...`, enquanto
 * projetos antigos entregam a anon key e a service_role em JWT. As duas
 * gerações funcionam com o supabase-js, então aceitamos os dois nomes de
 * variável em vez de obrigar quem está configurando a renomear na Vercel.
 *
 * Cada `process.env.NEXT_PUBLIC_*` precisa aparecer LITERALMENTE aqui: o Next
 * substitui essas expressões no build, e uma leitura dinâmica
 * (`process.env[nome]`) chegaria vazia no browser.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

/** Chave pública. Vai para o browser de propósito — quem protege os dados é a RLS. */
export const SUPABASE_CHAVE_PUBLICA =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  ''

export const supabaseConfigurado = Boolean(SUPABASE_URL && SUPABASE_CHAVE_PUBLICA)

/** Placeholders para o app renderizar a tela de setup em vez de estourar. */
export const URL_PLACEHOLDER = 'https://placeholder.supabase.co'
export const CHAVE_PLACEHOLDER = 'placeholder-anon-key'

/**
 * Chave que IGNORA RLS. Só servidor — nunca com prefixo NEXT_PUBLIC_, para o
 * build falhar se alguém tentar importar isto de um componente client.
 */
export function chaveDeServico(): string | null {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? null
}

export const MENSAGEM_SETUP =
  'Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e ' +
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ou NEXT_PUBLIC_SUPABASE_ANON_KEY).'
