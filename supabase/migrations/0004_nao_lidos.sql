-- Cheque Mate — o que a IA não conseguiu ler.
--
-- Em campo de texto a lacuna vai inline, no próprio valor ("0210?7369"), porque
-- ali falta um caractere e não o campo inteiro. Em campo tipado (valor, datas)
-- não cabe "?" num numeric/date, então o nome do campo entra nesta lista.
--
-- Isso desfaz uma ambiguidade que existia: `bom_para date null` significava
-- tanto "o cheque não tem essa anotação" quanto "não consegui ler". Só o
-- segundo caso vira "?" vermelho na tela.

alter table public.cheques
  add column if not exists nao_lidos jsonb not null default '[]'::jsonb;

comment on column public.cheques.nao_lidos is
  'Campos tipados que a IA tentou ler e não conseguiu. Campo ausente do cheque NÃO entra aqui.';
