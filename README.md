# Cheque Mate

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
| Auth       | Supabase Auth: Google OAuth **e** e-mail + senha                         |
| Visão      | Gemini 2.5 Flash (padrão) ou Groq llama-4-scout, com saída estruturada   |

### Sobre o provedor de IA (comparação com o MatchCV)

O MatchCV chama a **API do Groq** com `fetch` puro (sem SDK), modelo
`llama-3.3-70b-versatile`, endpoint OpenAI-compatible, dentro de uma Supabase Edge Function —
a `GROQ_API_KEY` fica só no servidor. (O projeto também tem um `GEMINI_API_KEY` nos secrets,
mas ele não é usado por nenhum código do repositório.)

O Cheque Mate **replica o padrão** — `fetch` puro, sem SDK, chave só no servidor, saída
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
3. `supabase/migrations/0003_revisao_manual.sql` — coluna `revisado_manualmente`, usada pela
   correção manual da operadora.

Ou, com a CLI:

```bash
npx supabase link --project-ref <ref-do-projeto>
npx supabase db push
```

### 2. Autenticação

Dois caminhos de entrada: **Google** e **e-mail + senha**. Os dois precisam estar habilitados
em **Authentication → Providers** (Email e Google).

**URL Configuration** (Authentication → URL Configuration) — é aqui que mora a pegadinha:

| Campo | Valor |
| --- | --- |
| **Site URL** | `https://<seu-dominio-na-vercel>` (só um, e **nunca** localhost) |
| **Redirect URLs** | `https://<seu-dominio-na-vercel>/**` e `http://localhost:3000/**` |

A **Site URL** é o que o Supabase usa para montar os links dos e-mails de confirmação e de
recuperação de senha. Se ela estiver em `http://localhost:3000`, todo e-mail que sair vai
apontar para a máquina de quem clicou — e o link não abre. As **Redirect URLs** são só a lista
de destinos permitidos; deixar localhost aí é o que permite desenvolver localmente, e não afeta
os e-mails.

**Google**: em **Providers → Google**, cole Client ID e Secret do Google Cloud Console. Lá, no
OAuth client do tipo *Web application*:

- Authorized JavaScript origins: `https://<seu-dominio-na-vercel>`
- Authorized redirect URIs: `https://<ref-do-projeto>.supabase.co/auth/v1/callback`
  (o `<ref>` é o subdomínio da sua `NEXT_PUBLIC_SUPABASE_URL`)

O redirect vai para o **Supabase**, não para o app: o Supabase recebe o retorno do Google e só
então manda para `/auth/callback` do app.

**Fluxos que o app trata** em `src/app/auth/callback/route.ts`: OAuth, confirmação de e-mail e
recuperação de senha, nos dois formatos de link (`?code=` do PKCE e `?token_hash=&type=` de
templates customizados). Recuperação de senha cai em `/nova-senha`, que também serve para
trocar a senha estando logada.

### 3. Variáveis de ambiente

Copie `.env.example` para `.env.local` (dev) e configure as mesmas na Vercel (Settings →
Environment Variables):

| Variável                                | Onde encontrar                                      |
| --------------------------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`              | Supabase → Project Settings → API                   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  | idem → API Keys (é pública, protegida por RLS)      |
| `SUPABASE_SECRET_KEY`                   | idem — **só servidor**, ignora RLS, nunca no client |
| `VISION_PROVIDER`                       | `gemini` (padrão) ou `groq`                         |
| `GEMINI_API_KEY`                        | https://aistudio.google.com/apikey                  |
| `GROQ_API_KEY`                          | https://console.groq.com/keys                       |

O Supabase renomeou as chaves de API: projetos novos entregam `sb_publishable_...` e
`sb_secret_...`; projetos antigos entregam a anon key e a service_role em JWT. O app aceita os
dois nomes de variável — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ou
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` — então
basta preencher o nome que o seu projeto mostrar (`src/lib/supabase/env.ts`).

### 4. Rodar

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 113 testes: validação, análise do lote, revalidação, CSV
npm run typecheck
npm run build
```

### Animações

Os snippets vêm de [transitions.dev](https://transitions.dev/), copiados dos arquivos oficiais
do skill `Jakubantalik/transitions.dev` para `src/app/transitions.css` com os nomes semânticos
das variáveis preservados (então dá para afinar duração/distância num lugar só). Cada bloco
mantém o guard de `prefers-reduced-motion`, obrigatório.

Só entrou transição que comunica algo, porque a operadora passa horas nesta tela:

| Transição | Onde | Por quê |
| --- | --- | --- |
| Text states swap | botão de copiar | é a ação mais repetida do app; a troca "Copiar CMC7" → "Copiado ✓" é o que confirma que o clique pegou |
| Modal open / close | foto em tela cheia | a foto é "por cima" da página, não ancorada num gatilho |
| Panel reveal | formulário de correção | ele abre dentro da linha, então `--panel-translate-y` cai de 100px para 14px |
| Page side-by-side | avançar/voltar no modo conferência | entrada direcional: avançando entra pela direita, voltando pela esquerda |
| Checkbox check | marcar "lançado" | o traço sendo desenhado é a confirmação da marcação |
| Error state shake | mensagens de erro | sacode de novo no mesmo erro repetido, que é quando a pessoa não viu na primeira |
| Number pop-in | valor em risco do lote | só nesse número, que é o que precisa puxar a atenção |
| Toast | confirmação de cópia no modo conferência | avisa sem roubar o foco do teclado |

Detalhe que custou um bug: `.t-check` tem de ficar no **mesmo elemento** que carrega o
`aria-checked` — é o atributo que a regra usa para soltar o traço. Com a classe num filho, o
seletor nunca casa e o check nunca aparece.

### Cores dos gráficos

O cronograma usa o padrão **emphasis**: uma única cor de acento — o vermelho de status
reservado (`#d03b3b`, "pode ser devolvido") — e o resto no cinza de recessão (`#64748b`). Só
duas marcas, com legenda sempre presente, rótulo direto compacto no topo de cada coluna, linha
de leitura com o valor cheio e uma visão em tabela: a identidade nunca depende só da cor. O par
foi verificado com o validador de paleta (separação CVD ΔE 12,4 · contraste ≥ 3:1 na superfície
clara); o cinza fica abaixo do piso de croma de propósito, porque é o canal de recessão, não uma
segunda série categórica.

---

## Como o app funciona

### Upload (`/lotes/novo`)

Drag-and-drop no desktop, câmera/galeria no mobile. A resolução é medida no browser assim que o
arquivo entra: foto com menos de **1000px no lado menor** recebe o aviso

> ‼️ Cheque com baixa qualidade — a análise pode acabar sendo afetada. Enviar outra foto ou
> seguir mesmo assim?

com as duas saídas como botão. **Quem decide é a operadora** — mas o aviso não morre no clique:
quando ela escolhe seguir, todos os cheques daquela foto ganham um alerta amarelo permanente
("Lido de foto com baixa qualidade", com a medida real em px), então quem abrir o lote depois
sabe de onde aquela leitura saiu. Antes do upload a foto é reduzida para no máximo 2400px no
lado maior (`src/lib/imagem.ts`).

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

O topo é analítico e responde, nesta ordem: **quanto desse lote pode voltar do banco**
(soma dos cheques vermelhos, em reais e em % do lote), quanto vale o lote, quantos estão a
conferir e quanto do trabalho já foi lançado. Depois vem o **cronograma de vencimentos** —
coluna empilhada por mês, com a parte em risco destacada — e **"o que apareceu neste lote"**,
que agrupa os alertas por tipo com contagem e valor afetado (`extenso divergente ×3 ·
R$ 12.400,90`) em vez de uma lista de 40 linhas soltas. Cada grupo abre nos cheques atingidos.

A lista tem **filtros** (todos / pode devolver / conferir / a lançar / lançados, com contagem)
e **ordenação** (por emitente agrupado, por data, maior valor, mais grave). Cada linha traz a
miniatura expansível, o CMC7 com os dígitos duvidosos destacados, botões de copiar separados
para **CMC7, valor e data** — os três campos que ela digita no sistema — mais "copiar linha"
separada por tabulação para colar em planilha. Checkbox "lançado" persistido por cheque.

### Modo conferência (`/lotes/[id]/conferir`)

É onde o tempo é ganho. Um cheque por vez, foto grande de um lado e os dados do outro na
ordem em que ela digita, com fila escolhível (a lançar / pode devolver / todos) e progresso.
Tudo pelo teclado: `C` copia o CMC7, `V` o valor, `D` a data, `L` a linha, `Enter` marca como
lançado e avança, `←`/`→` navega, `Z` amplia a foto, `E` abre a correção, `?` mostra os
atalhos. Um cheque sai em quatro toques, sem tirar a mão do teclado.

### Correção manual com revalidação

Quando o modelo lê errado, quem corrige é a operadora — e a correção **re-roda a validação no
servidor**: consertar um dígito do CMC7 recalcula o DV, consertar a transcrição do extenso roda
o parser de novo, mexer nas datas recalcula a data efetiva e o alerta de "bom para". Um campo
editado nunca fica com um alerta velho pendurado. A linha é marcada como
`revisado_manualmente` e a tela mostra "revisado por você". A revalidação roda no servidor
(`PATCH /api/cheques/[id]`), nunca no browser: status e alertas são a verdade do registro e não
podem depender do que o client mandou.

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
- A chave de serviço fica sem prefixo `NEXT_PUBLIC_` de propósito: se alguém importar
  `src/lib/supabase/admin.ts` de um componente client, quebra em vez de vazar.
- A chave do modelo de visão nunca chega ao browser.
- Coluna `org_id` (nullable, sem policy) já existe nas três tabelas para a fase 2
  (multiempresa) entrar sem migração destrutiva.

## Critério de aceite do MVP

Amanda processa um lote real de ponta a ponta e lança os CMC7 no sistema da empresa só copiando
da tela, sem decifrar dígito no olho.
