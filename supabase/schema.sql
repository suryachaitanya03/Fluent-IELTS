-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.

-- Study plan + progress, one row per account
create table if not exists public.study_states (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  payload    jsonb not null,
  revision   integer not null default 1,
  updated_at timestamptz not null default now()
);

-- PDF library metadata (files themselves live in Storage bucket "study-pdfs")
create table if not exists public.study_pdfs (
  user_id     uuid not null references auth.users(id) on delete cascade,
  id          uuid not null,
  name        text not null check (char_length(name) <= 255),
  size        integer not null check (size > 0 and size <= 26214400),
  storage_key text not null,
  added_at    timestamptz not null default now(),
  primary key (user_id, id)
);

-- Row Level Security: each account can only touch its own rows
alter table public.study_states enable row level security;
alter table public.study_pdfs   enable row level security;

drop policy if exists "own study state" on public.study_states;
create policy "own study state" on public.study_states
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own pdf rows" on public.study_pdfs;
create policy "own pdf rows" on public.study_pdfs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Private storage bucket, PDFs only, 25 MB max
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-pdfs', 'study-pdfs', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = 26214400, allowed_mime_types = array['application/pdf'];

-- Files are stored as <user id>/<pdf id>.pdf; each account only reaches its own folder
drop policy if exists "own pdf files read"   on storage.objects;
drop policy if exists "own pdf files insert" on storage.objects;
drop policy if exists "own pdf files update" on storage.objects;
drop policy if exists "own pdf files delete" on storage.objects;

create policy "own pdf files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'study-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own pdf files insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'study-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own pdf files update" on storage.objects
  for update to authenticated
  using (bucket_id = 'study-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own pdf files delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'study-pdfs' and (storage.foldername(name))[1] = (select auth.uid())::text);
