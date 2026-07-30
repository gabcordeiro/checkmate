-- ChequeCerto — Storage das fotos dos cheques.
--
-- Bucket PRIVADO "cheques". O app nunca serve URL pública: a tela do lote pede
-- signed URLs de curta duração. O isolamento é por prefixo de pasta =
-- auth.uid(), então o caminho é sempre `<uid>/<batch_id>/<arquivo>`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cheques',
  'cheques',
  false,
  15728640, -- 15 MB: foto de celular sem compressão cabe
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects já tem RLS habilitado por padrão no Supabase.

drop policy if exists "cheques_read_own_folder" on storage.objects;
create policy "cheques_read_own_folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cheques'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cheques_insert_own_folder" on storage.objects;
create policy "cheques_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'cheques'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cheques_update_own_folder" on storage.objects;
create policy "cheques_update_own_folder" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'cheques'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "cheques_delete_own_folder" on storage.objects;
create policy "cheques_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'cheques'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
