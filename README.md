# ChequeCerto

Conferência de lotes de cheques pré-datados para securitizadora/factoring.

A operadora fotografa os cheques, o app lê o CMC7, organiza o lote por emitente em ordem de
data e **avisa o que faria o banco devolver o cheque** — divergência entre valor por extenso e
numérico, "bom para" anterior à data escrita, falta de assinatura, rasura em data/nominal/valor.

**Princípio central:** a ferramenta é um CONFERENTE, não um lançador automático. O modelo de
visão EXTRAI, o código VALIDA deterministicamente, a UI ALERTA. A decisão final é sempre da
operadora. Erro do modelo custa no máximo um alerta falso, nunca um lançamento errado.

---

## Stack

| Camada     | Escolha                                                                  |
| ---------- | ------------------------------------------------------------------------ |
| Frontend   | Next.js 15 (App Router) + React 19 + TypeScript + Tailwind, mobile-first |
| Hospedagem | Vercel                                                                   |
| Backend    | Supabase — Postgres + Auth + Storage, RLS em todas as tabelas            |
| Auth       | Supabase Auth com Google OAuth (sem cadastro por senha)                  |
| Visão      | Gemini 2.5 Flash (padrão) ou Groq llama-4-scout, com saída estruturada   |

### Sobre o provedor de IA (comparação com o MatchCV)

O MatchCV chama a **API do Groq** com `fetch` puro (sem SDK), modelo
`llama-3.3-70b-versatile`, endpoint OpenAI-compatible, dentro de uma Supabase Edge Function —
a `GROQ_API_KEY` fica só no servidor. (O projeto também tem um `GEMINI_API_KEY` nos secrets,
mas ele não é usado por nenhum código do repositório.)

O ChequeCerto **replica o padrão** — `fetch` puro, sem SDK, chave só no servidor, saída
estruturada em vez de parsing de texto livre — mas **troca o modelo**, porque
`llama-3.3-70b-versatile` é texto-only e aqui o modelo precisa ver a imagem:

- **`gemini` (padrão):** `gemini-2.5-flash` com `responseSchema`, que é saída estruturada
  garantida pelo servidor do modelo. Melhor OCR de manuscrito, e a chave você já tem.
- **`groq`:** `meta-llama/llama-4-scout-17b-16e-instruct` (esse tem visão), com
  `response_format: json_object` e o schema no prompt.

Troque com `VISION_PROVIDER=gemini|groq`. Sem a variável, o app usa quem tiver chave.

A extração roda em **API route do Next** (`/api/extract`), não em Edge Function, para a chave
ficar nas Environment Variables da Vercel junto com o resto do deploy.

---

## Setup

### 1. Projeto Supabase

Crie um projeto (recomendado `sa-east-1` pela latência) e rode as migrations, em ordem, no SQL
Editor:

1. `supabase/migrations/0001_init.sql` — tabelas `profiles`, `batches`, `cheques`, RLS, trigger
   que cria o profile no primeiro login e trigger que mantém os totais do lote.
2. `supabase/migrations/0002_storage.sql` — bucket privado `cheques` e policies por prefixo de
   pasta.

Ou, com a CLI:

```bash
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
```

### 2. Google OAuth

No Supabase: **Authentication → Providers → Google**, habilite e cole Client ID/Secret do
Google Cloud Console. Em **Authentication → URL Configuration → Redirect URLs**, adicione:

```
http://localhost:3000/auth/callback
https://<seu-dominio-na-vercel>/auth/callback
```

No Google Cloud Console, o **Authorized redirect URI** é o do Supabase:
`https://<ref>.supabase.co/auth/v1/callback`.

### 3. Variáveis de ambiente

Copie `.env.example` para `.env.local` (dev) e configure as mesmas na Vercel (Settings →
Environment Variables):

| Variável                        | Onde encontrar                                       |
| ------------------------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase → Project Settings → API                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | idem (é pública, protegida por RLS)                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | idem — **só servidor**, ignora RLS, nunca no client   |
| `VISION_PROVIDER`               | `gemini` (padrão) ou `groq`                          |
| `GEMINI_API_KEY`                | https://aistudio.google.com/apikey                   |
| `GROQ_API_KEY`                  | https://console.groq.com/keys                        |

### 4. Rodar

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 86 testes do módulo de validação
npm run typecheck
npm run build
```

---

## Como o app funciona

### Upload (`/lotes/novo`)

Drag-and-drop no desktop, câmera/galeria no mobile. A validação de resolução é **client-side e
bloqueante**: foto com menos de **1000px no lado menor** é recusada com a orientação de
refotografar. Isso é feature, não limitação — foto de 400px de largura não tem o pixel do CMC7,
e chutar dígito custa mais caro que tirar a foto de novo. Antes do upload a foto é reduzida
para no máximo 2400px no lado maior (`src/lib/imagem.ts`).

Foto com vários cheques empilhados funciona: o modelo separa, e o app avisa que a confiança cai.

### Extração (`/api/extract`)

`upload → Storage → visão → JSON → validação → persistência`. Usa o cliente Supabase **do
usuário**, então RLS vale para tudo que a rota lê e escreve — não há `service_role` nesse
caminho. O prompt (`src/lib/vision/prompt.ts`) proíbe explicitamente chutar dígito: leitura
ambígua tem de virar entrada em `digitos_duvidosos` com as alternativas.

### Validação determinística (`src/lib/validation/`)

TypeScript puro, sem rede, sem React, 100% testável. É aqui que mora o valor do produto.

- **`cmc7.ts`** — DV módulo 10 (Luhn) de cada bloco (8/12/10 dígitos). Quando o DV não fecha,
  testa as combinações das alternativas dos dígitos duvidosos e lista **só as que fecham**:
  "Provavelmente 3 — com 8 o verificador não bate". Nenhuma combinação fecha → refotografar.
  (Os três blocos têm quantidade ímpar de dígitos de dados — 7, 11 e 9 — então a alternância
  de pesos dá o mesmo resultado da esquerda ou da direita: o algoritmo não depende disso.)
- **`extenso.ts`** — parser extenso→número em pt-BR: unidades a bilhões, centavos, fração
  `/100`, e as grafias que aparecem em cheque de verdade (`hum mil`, `quatrossentos`,
  `cincoenta`, `dusentos`). Divergência com o numérico é **alerta vermelho**, porque pela Lei
  do Cheque (7.357/85, art. 12) vale o extenso — e o banco devolve.
- **`datas.ts` + `index.ts`** — "bom para" anterior à data escrita, data ilegível/rasurada e
  janelas de plausibilidade de 12 meses. A `data_efetiva` (que manda na ordenação) é o "bom
  para" quando ele é coerente com a emissão, senão a data escrita no cheque.

Níveis: **vermelho** = o banco pode devolver (prejuízo direto, a securitizadora já pagou a
operação); **amarelo** = leitura suspeita, conferir na foto.

### Tela do lote (`/lotes/[id]`)

Cheques agrupados por emitente normalizado (caixa alta, sem acento), ordenados por data
efetiva, com subtotal por emitente e total do lote. Coluna CMC7 com os 30 dígitos e botão
COPIAR de um clique; dígitos duvidosos destacados, com tooltip explicando o que o verificador
decidiu. Miniatura da foto expansível ao lado de cada linha. Checkbox "lançado no sistema"
persistido por cheque. Painel no topo com o resumo e a lista de alertas — vermelhos primeiro,
cada um linkando para a linha do cheque.

### Histórico e exportação

`/lotes` lista os lotes com busca por emitente, nº do cheque, data (`29/07`, `29/07/2026`,
`2026-07-29`) ou valor. Exportação em CSV (ponto e vírgula, vírgula decimal, BOM para o Excel
pt-BR) e PDF simples de conferência.

---

## Segurança

- RLS habilitado em `profiles`, `batches` e `cheques`; todas as policies são
  `owner_id = auth.uid()`.
- Bucket `cheques` privado. Policies de Storage por prefixo de pasta = `auth.uid()`, e o
  caminho é sempre `<uid>/<batch_id>/<arquivo>`. A tela pede signed URLs de 1 hora.
- `SUPABASE_SERVICE_ROLE_KEY` sem prefixo `NEXT_PUBLIC_` de propósito: se alguém importar
  `src/lib/supabase/admin.ts` de um componente client, quebra em vez de vazar.
- A chave do modelo de visão nunca chega ao browser.
- Coluna `org_id` (nullable, sem policy) já existe nas três tabelas para a fase 2
  (multiempresa) entrar sem migração destrutiva.

## Critério de aceite do MVP

Amanda processa um lote real de ponta a ponta e lança os CMC7 no sistema da empresa só copiando
da tela, sem decifrar dígito no olho.
