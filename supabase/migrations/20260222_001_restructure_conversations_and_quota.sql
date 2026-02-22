-- Restructure for UUID-native conversations + strict daily quota enforcement
-- Safe to run multiple times.

create extension if not exists pgcrypto;

-- Normalize legacy conversation IDs (text) to UUID for existing deployments.
do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'conversations'
          and column_name = 'id'
          and data_type in ('text', 'character varying')
    ) then
        alter table public.messages
            drop constraint if exists messages_conversation_id_fkey;

        create temporary table _conversation_uuid_map (
            old_id text primary key,
            new_id uuid not null
        ) on commit drop;

        insert into _conversation_uuid_map (old_id, new_id)
        select
            c.id,
            case
                when c.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    then c.id::uuid
                else gen_random_uuid()
            end
        from public.conversations c;

        update public.conversations c
           set id = m.new_id::text
          from _conversation_uuid_map m
         where c.id = m.old_id
           and c.id <> m.new_id::text;

        delete from public.messages msg
         where not exists (
            select 1
            from public.conversations c
            where c.id::text = msg.conversation_id
         );

        update public.messages msg
           set conversation_id = m.new_id::text
          from _conversation_uuid_map m
         where msg.conversation_id = m.old_id
           and msg.conversation_id <> m.new_id::text;

        alter table public.conversations
            alter column id type uuid using id::uuid,
            alter column id set default gen_random_uuid();

        alter table public.messages
            alter column conversation_id type uuid using conversation_id::uuid;

        alter table public.messages
            add constraint messages_conversation_id_fkey
            foreign key (conversation_id)
            references public.conversations (id)
            on delete cascade;
    end if;
end $$;

-- Ensure UUID shape for fresh installs too.
alter table if exists public.conversations
    alter column id set default gen_random_uuid();

-- Ensure non-negative counters.
alter table if exists public.daily_usage
    drop constraint if exists daily_usage_request_count_non_negative;
alter table if exists public.daily_usage
    add constraint daily_usage_request_count_non_negative check (request_count >= 0);

alter table if exists public.user_limits
    drop constraint if exists user_limits_daily_limit_positive;
alter table if exists public.user_limits
    add constraint user_limits_daily_limit_positive check (daily_limit >= 1 and daily_limit <= 10000);

-- Hard-limit quota RPC: single atomic increment guarded by request_count < limit.
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

    v_limit := greatest(1, least(v_limit, 10000));

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
        select du.request_count
          into v_used
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

-- Auto-provision defaults per user.
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

-- Backfill defaults for existing users.
insert into public.profiles (id, email, display_name, created_at, updated_at)
select
    u.id,
    u.email,
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
    now(),
    now()
from auth.users u
on conflict (id) do update
    set email = excluded.email,
        display_name = coalesce(excluded.display_name, public.profiles.display_name),
        updated_at = now();

insert into public.user_settings (user_id, top_k, temperature, default_indexes, updated_at)
select u.id, 10, 0.2, '{}', now()
from auth.users u
on conflict (user_id) do nothing;

insert into public.user_limits (user_id, daily_limit, updated_at)
select u.id, 10, now()
from auth.users u
on conflict (user_id) do nothing;
