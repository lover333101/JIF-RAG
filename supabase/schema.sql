-- JIF RAG - Supabase schema
-- Run this in Supabase SQL editor before using protected chat APIs.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text,
    display_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    title text not null default 'New Session',
    active_index_names text[] not null default '{}',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    archived_at timestamptz
);
create index if not exists conversations_user_id_updated_idx
    on public.conversations (user_id, updated_at desc);

create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    role text not null check (role in ('user', 'assistant')),
    content text not null,
    markdown_content text not null,
    citations jsonb not null default '[]'::jsonb,
    matches jsonb not null default '[]'::jsonb,
    generation_id uuid,
    created_at timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx
    on public.messages (conversation_id, created_at asc);

create table if not exists public.user_settings (
    user_id uuid primary key references auth.users (id) on delete cascade,
    top_k integer not null default 10,
    temperature numeric(3,2) not null default 0.2,
    default_indexes text[] not null default '{}',
    updated_at timestamptz not null default now()
);

create table if not exists public.user_limits (
    user_id uuid primary key references auth.users (id) on delete cascade,
    daily_limit integer not null default 10 check (daily_limit >= 1 and daily_limit <= 10000),
    updated_at timestamptz not null default now()
);

create table if not exists public.daily_usage (
    user_id uuid not null references auth.users (id) on delete cascade,
    usage_date date not null,
    request_count integer not null default 0 check (request_count >= 0),
    updated_at timestamptz not null default now(),
    primary key (user_id, usage_date)
);

create table if not exists public.user_index_access (
    user_id uuid not null references auth.users (id) on delete cascade,
    index_name text not null,
    created_at timestamptz not null default now(),
    primary key (user_id, index_name)
);

create table if not exists public.access_requests (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    full_name text,
    company text,
    message text,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

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
alter table public.chat_generations
    drop constraint if exists chat_generations_status_check;
alter table public.chat_generations
    add constraint chat_generations_status_check
    check (status in ('processing', 'completed', 'failed', 'expired'));
create index if not exists chat_generations_user_status_updated_idx
    on public.chat_generations (user_id, status, updated_at desc);
create index if not exists chat_generations_conversation_status_updated_idx
    on public.chat_generations (conversation_id, status, updated_at desc);
create index if not exists chat_generations_task_id_idx
    on public.chat_generations (task_id)
    where task_id is not null;

alter table public.messages
    drop constraint if exists messages_matches_is_array_check;
alter table public.messages
    add constraint messages_matches_is_array_check
    check (jsonb_typeof(matches) = 'array');
alter table public.messages
    drop constraint if exists messages_generation_id_fkey;
alter table public.messages
    add constraint messages_generation_id_fkey
    foreign key (generation_id)
    references public.chat_generations (id)
    on delete set null;
create index if not exists messages_generation_id_idx
    on public.messages (generation_id);
create unique index if not exists messages_assistant_generation_unique_idx
    on public.messages (generation_id)
    where generation_id is not null and role = 'assistant';

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.chat_generations enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_limits enable row level security;
alter table public.daily_usage enable row level security;
alter table public.user_index_access enable row level security;

drop policy if exists profiles_own_rows on public.profiles;
create policy profiles_own_rows
on public.profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists conversations_own_rows on public.conversations;
create policy conversations_own_rows
on public.conversations
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists messages_own_rows on public.messages;
create policy messages_own_rows
on public.messages
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists chat_generations_own_rows on public.chat_generations;
create policy chat_generations_own_rows
on public.chat_generations
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_settings_own_rows on public.user_settings;
create policy user_settings_own_rows
on public.user_settings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_limits_own_rows on public.user_limits;
create policy user_limits_own_rows
on public.user_limits
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists daily_usage_own_rows on public.daily_usage;
create policy daily_usage_own_rows
on public.daily_usage
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists user_index_access_own_rows on public.user_index_access;
create policy user_index_access_own_rows
on public.user_index_access
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.consume_daily_quota(
    p_user_id uuid,
    p_default_limit integer default 10
)
returns table (
    allowed boolean,
    daily_limit integer,
    used integer,
    remaining integer,
    reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_today date := (now() at time zone 'utc')::date;
    v_limit integer;
    v_used integer;
begin
    select coalesce(ul.daily_limit, p_default_limit)
      into v_limit
      from public.user_limits ul
     where ul.user_id = p_user_id;

    if v_limit is null then
        v_limit := p_default_limit;
    end if;
    v_limit := greatest(1, v_limit);

    insert into public.daily_usage (user_id, usage_date, request_count, updated_at)
    values (p_user_id, v_today, 0, now())
    on conflict (user_id, usage_date) do nothing;

    update public.daily_usage
       set request_count = request_count + 1,
           updated_at = now()
     where user_id = p_user_id
       and usage_date = v_today
       and request_count < v_limit
    returning request_count into v_used;

    if v_used is null then
        select du.request_count into v_used
          from public.daily_usage du
         where du.user_id = p_user_id
           and du.usage_date = v_today;
        allowed := false;
    else
        allowed := true;
    end if;

    daily_limit := v_limit;
    used := coalesce(v_used, 0);
    remaining := greatest(v_limit - used, 0);
    reset_at := date_trunc('day', now() at time zone 'utc') + interval '1 day';
    return next;
end;
$$;

grant execute on function public.consume_daily_quota(uuid, integer) to authenticated;
grant execute on function public.consume_daily_quota(uuid, integer) to service_role;

create or replace function public.handle_new_user_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, email, display_name, created_at, updated_at)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
        now(),
        now()
    )
    on conflict (id) do update
        set email = excluded.email,
            display_name = coalesce(excluded.display_name, public.profiles.display_name),
            updated_at = now();

    insert into public.user_settings (user_id, top_k, temperature, default_indexes, updated_at)
    values (new.id, 10, 0.2, '{}', now())
    on conflict (user_id) do nothing;

    insert into public.user_limits (user_id, daily_limit, updated_at)
    values (new.id, 10, now())
    on conflict (user_id) do nothing;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created_defaults on auth.users;
create trigger on_auth_user_created_defaults
after insert on auth.users
for each row
execute function public.handle_new_user_defaults();
