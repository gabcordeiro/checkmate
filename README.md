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

- **`gemini` (padrão):** um modelo Flash com `responseSchema`, que é saída estruturada garantida
  pelo servidor do modelo. Melhor OCR de manuscrito.
- **`groq`:** `meta-llama/llama-4-scout-17b-16e-instruct` (esse tem visão), com
  `response_format: json_object` e o schema no prompt.

Troque com `VISION_PROVIDER=gemini|groq`. Sem a variável, o app usa quem tiver chave.

**O nome do modelo do Gemini não está fixo no código, de propósito.** O Google aposenta nomes
sem aviso — `gemini-2.5-flash` começou a responder 404 ("no longer available to new users") de um
dia para o outro e derrubou a extração. Então `src/lib/vision/gemini-modelos.ts` tenta uma lista
de candidatos (os apelidos `-latest` primeiro, porque o Google os mantém apontando para um modelo
vivo) e, se todos derem 404, **pergunta à própria API quais modelos aquela chave tem** e escolhe
o melhor para ler cheque: prefere Flash (custo por cheque), penaliza `lite` (economiza mais e
erra mais dígito) e descarta embedding/tts/imagem/live. O escolhido fica em memória do processo.
`GEMINI_MODEL` continua existindo para forçar um modelo específico.

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
4. `supabase/migrations/0004_nao_lidos.sql` — coluna `nao_lidos`, com os campos que a IA não
   conseguiu ler (viram o `?` vermelho na tela).

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

### Linguagem dos alertas

Teste com a operadora: diante de *"Bloco 1: dígito verificador não fecha. Lido 9, calculado 8"*
ela disse **"não entendi"** e teve de adivinhar (*"acho que ele quis dizer que leu 9 na foto mas
calculado foi 8"*). Alerta que precisa ser adivinhado não protege ninguém.

Três mudanças saíram disso:

1. **Sem jargão.** "Bloco 2" virou "2º grupo (número do cheque)" — diz onde olhar na tarja.
   "Dígito verificador não fecha" virou "algum número do 2º grupo do CMC7 foi lido errado",
   com a explicação de que o último número do grupo é de conferência.
2. **Os números saem do texto.** Cada alerta carrega `dados` (`{ naFoto: '9', pelaConta: '8' }`)
   separado da frase, e a tela monta o lado a lado — em vez de a operadora extrair isso de uma
   frase corrida.
3. **Botão "? entender"** em cada alerta, abrindo um modal com quatro blocos: *o que aconteceu*,
   *neste cheque* (a comparação com os valores reais), *por que isso importa* (em dinheiro) e
   *o que fazer* (passos numerados). Alertas importantes trazem ainda um "para ficar claro" com
   um caso concreto.

A separação é de propósito: o validador (`src/lib/validation/`) produz o FATO — código, nível e
números; o catálogo (`src/lib/explicacoes.ts`) ENSINA. Assim a regra continua testável sem
carregar texto didático, e um teste garante que todo alerta que o validador sabe emitir tem
explicação escrita — se alguém criar um alerta novo sem explicar, a suíte quebra.

### O `?`: o que não foi lido não vira alerta

A segunda rodada de teste mostrou que explicar melhor o dígito verificador era resolver o
problema errado. Nem a operadora nem o dono do produto sabem o que é isso, e não precisam —
é conceito interno do CMC7, não algo que se use conferindo cheque. A frase que fechou o
assunto foi *"por que a Amanda não faz isso no trabalho?"*.

O desenho veio da própria operadora: **mostre o que você leu e marque em vermelho o que não
leu.** Um `?` no lugar do caractere, e quem quiser saber mais clica e lê uma frase — *"o
sistema não conseguiu ler este número"* — com os botões de corrigir e ver a foto. Nada além
disso.

Como isso aparece no código:

- **O modelo declara a lacuna.** Em campo de texto (CMC7, extenso, nominal, emitente, nº,
  agência, conta) ele escreve `?` dentro do próprio valor. Em campo tipado (valor, datas) não
  cabe `?` num número, então ele devolve `null` e lista o campo em `nao_lidos: string[]`. De
  quebra isso desfaz uma ambiguidade antiga: `bom_para_anotado: null` agora distingue "o cheque
  não tem essa anotação" de "não consegui ler".
- **`digitos_duvidosos` ficou com um significado só:** *"li, mas pode ser 3 ou 8"*. `?` é
  *"não li"*. Antes os dois casos vinham misturados no mesmo campo.
- **Nada se afirma sobre o que não se leu.** `checarBloco()` só calcula a conferência interna
  quando o bloco está íntegro — tamanho certo e sem `?` (`avaliavel`). Isso consertou um falso
  positivo real: um bloco lido com 9 dígitos onde o padrão tem 8 gerava DOIS alertas para a
  mesma causa, e o segundo acusava um número de estar errado quando o problema era outro.
- **Extenso lido pela metade não vira vermelho.** `parseExtenso()` devolve `parcial: true` e a
  comparação com o valor numérico **não roda** — comparar produziria um valor menor que o do
  cheque e um "o banco vai devolver" causado por falha nossa de leitura. Falso vermelho é o pior
  defeito possível aqui: destrói a confiança no semáforo, que é o que o produto vende. Com
  cheque manuscrito, que é a maioria, o extenso é justamente o campo mais difícil.
- **`?` não vai para o clipboard.** Enquanto houver lacuna, o botão de copiar CMC7 vira
  "Complete os ? para copiar" e o atalho `C` avisa em vez de copiar. Um CMC7 furado colado no
  sistema da empresa é pior que uma célula vazia — a célula vazia ela percebe.
- **A lacuna sobrevive à gravação.** `montarCmc7Completo()` preserva o `?` (diferente de
  `somenteDigitos()`, que o descartaria e encurtaria o número em silêncio). É por esse valor
  gravado que a tela decide se libera a cópia.
- **Corrigir apaga a marca.** Ao salvar, o campo editado sai de `nao_lidos` e o `?` some — quem
  leu foi ela, que é quem manda.

O único alerta de CMC7 que sobrou é o caso perigoso de verdade: tamanho certo, nenhum `?`,
nenhuma dúvida declarada, e mesmo assim a conferência do número não bate — ou seja, a IA leu
algum dígito errado sem perceber. Parece certo e não é, então avisa. Mas em uma linha, sem
"bloco", sem "dígito verificador" e sem somatória: *"Confira o CMC7 na foto."*

### Paleta e identidade

A regra que manda em tudo: **verde/amarelo/vermelho são reservados** para o semáforo de
conferência (ok / conferir / banco pode devolver). É a informação mais importante da tela, então
nenhuma cor de marca pode competir com ela. Por isso a marca é **índigo → violeta**
(`marca-*` em `tailwind.config.ts`): família visualmente distante das três e que carrega a
leitura de "banco, confiança, precisão".

O neutro é `tinta-*`, um cinza azulado — não preto puro, que é o que dá cara de wireframe. O
fundo são três halos de marca bem diluídos (nenhum passa de 13% de opacidade) em
`background-attachment: fixed`, para o gradiente não escorrer no scroll de um lote longo.

Tipografia: **Plus Jakarta Sans** na interface (números abertos, caixa alta larga — a tela é
cheia de valor e de emitente em CAIXA ALTA) e **JetBrains Mono** no CMC7, onde 0/O e 1/l não
podem se confundir, porque conferir dígito é o trabalho.

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

- **`cmc7.ts`** — conferência interna módulo 10 (Luhn) de cada bloco (8/12/10 dígitos), rodada
  **só quando o bloco está íntegro**: tamanho certo e sem `?`. Quando ela não fecha, testa as
  combinações das alternativas dos dígitos duvidosos; se exatamente uma fecha, o dígito é
  corrigido em silêncio (verde na tela, "1 número corrigido") e **nenhum alerta é emitido** —
  não há o que a operadora fazer. Nenhuma fecha → o aviso curto de conferir na foto.
  (Os três blocos têm quantidade ímpar de dígitos de dados — 7, 11 e 9 — então a alternância
  de pesos dá o mesmo resultado da esquerda ou da direita: o algoritmo não depende disso.)
- **`extenso.ts`** — parser extenso→número em pt-BR: unidades a bilhões, centavos, fração
  `/100`, e as grafias que aparecem em cheque de verdade (`hum mil`, `quatrossentos`,
  `cincoenta`, `dusentos`). Divergência com o numérico é **alerta vermelho**, porque pela Lei
  do Cheque (7.357/85, art. 12) vale o extenso — e o banco devolve. Transcrição com `?` devolve
  `parcial: true` e **não é comparada**: metade de uma frase daria um valor menor e um vermelho
  falso.
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
