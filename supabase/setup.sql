-- FreeSurf Transcriber — Supabase tables
-- Cloud sync for saved transcriptions (optional sign-in)

create table if not exists public.transcriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  segments jsonb,
  language text,
  duration real,
  created_at timestamptz not null default now()
);

alter table public.transcriptions enable row level security;

drop policy if exists "users manage own transcriptions" on public.transcriptions;
create policy "users manage own transcriptions"
  on public.transcriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
