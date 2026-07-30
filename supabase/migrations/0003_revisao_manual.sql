-- ChequeCerto — revisão manual do cheque.
--
-- A ferramenta é conferente: quando o modelo lê errado, quem corrige é a
-- operadora, e a correção precisa RE-RODAR a validação (DV do CMC7, parser do
-- extenso, datas). Esta coluna registra que a linha passou pela mão de alguém,
-- para o alerta que sobrou depois da correção valer mais que o alerta original.

alter table public.cheques
  add column if not exists revisado_manualmente boolean not null default false;

comment on column public.cheques.revisado_manualmente is
  'true quando a operadora corrigiu algum campo lido pelo modelo e a validação foi refeita.';
