-- Server-owned generation tracking for async chat completion.
-- Safe to run multiple times.

create table if not exists public.chat_generations (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    task_id text,
    status text not null default 'processing',
    error_message text,
    assistant_message_id uuid references public.messages (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz,
    expires_at timestamptz not null default (now() + interval '20 minutes')
);

alter table if exists public.chat_generations
    drop constraint if exists chat_generations_status_check;
alter table if exists public.chat_generations
    add constraint chat_generations_status_check
    check (status in ('processing', 'completed', 'failed', 'expired'));

create index if not exists chat_generations_user_status_updated_idx
    on public.chat_generations (user_id, status, updated_at desc);
create index if not exists chat_generations_conversation_status_updated_idx
    on public.chat_generations (conversation_id, status, updated_at desc);
create index if not exists chat_generations_task_id_idx
    on public.chat_generations (task_id)
    where task_id is not null;

alter table if exists public.messages
    add column if not exists matches jsonb not null default '[]'::jsonb;
alter table if exists public.messages
    add column if not exists generation_id uuid;
update public.messages
set matches = '[]'::jsonb
where matches is null;
alter table if exists public.messages
    alter column matches set default '[]'::jsonb;
alter table if exists public.messages
    alter column matches set not null;

alter table if exists public.messages
    drop constraint if exists messages_matches_is_array_check;
alter table if exists public.messages
    add constraint messages_matches_is_array_check
    check (jsonb_typeof(matches) = 'array');

do $$
begin
    if to_regclass('public.messages') is not null
       and to_regclass('public.chat_generations') is not null
       and not exists (
           select 1
           from pg_constraint
           where conname = 'messages_generation_id_fkey'
             and conrelid = 'public.messages'::regclass
       ) then
        alter table public.messages
            add constraint messages_generation_id_fkey
            foreign key (generation_id)
            references public.chat_generations (id)
            on delete set null;
    end if;
end $$;

create index if not exists messages_generation_id_idx
    on public.messages (generation_id);
create unique index if not exists messages_assistant_generation_unique_idx
    on public.messages (generation_id)
    where generation_id is not null and role = 'assistant';

alter table if exists public.chat_generations enable row level security;
alter table if exists public.chat_generations force row level security;

drop policy if exists chat_generations_own_rows on public.chat_generations;
create policy chat_generations_own_rows
on public.chat_generations
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on table public.chat_generations from anon, authenticated;
grant all on table public.chat_generations to service_role;
