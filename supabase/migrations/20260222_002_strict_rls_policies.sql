-- Strict RLS + privilege hardening for JIF RAG
-- Safe to run multiple times.

-- 1) Ensure RLS is enabled and enforced on all app tables.
alter table if exists public.profiles enable row level security;
alter table if exists public.profiles force row level security;

alter table if exists public.conversations enable row level security;
alter table if exists public.conversations force row level security;

alter table if exists public.messages enable row level security;
alter table if exists public.messages force row level security;

alter table if exists public.user_settings enable row level security;
alter table if exists public.user_settings force row level security;

alter table if exists public.user_limits enable row level security;
alter table if exists public.user_limits force row level security;

alter table if exists public.daily_usage enable row level security;
alter table if exists public.daily_usage force row level security;

alter table if exists public.user_index_access enable row level security;
alter table if exists public.user_index_access force row level security;

alter table if exists public.access_requests enable row level security;
alter table if exists public.access_requests force row level security;

-- 2) Drop broad legacy policies.
drop policy if exists profiles_own_rows on public.profiles;
drop policy if exists conversations_own_rows on public.conversations;
drop policy if exists messages_own_rows on public.messages;
drop policy if exists user_settings_own_rows on public.user_settings;
drop policy if exists user_limits_own_rows on public.user_limits;
drop policy if exists daily_usage_own_rows on public.daily_usage;
drop policy if exists user_index_access_own_rows on public.user_index_access;

-- 3) Drop strict policies if they already exist (idempotency).
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

drop policy if exists conversations_select_own on public.conversations;
drop policy if exists conversations_insert_own on public.conversations;
drop policy if exists conversations_update_own on public.conversations;
drop policy if exists conversations_delete_own on public.conversations;

drop policy if exists messages_select_own on public.messages;
drop policy if exists messages_insert_own on public.messages;

drop policy if exists user_settings_select_own on public.user_settings;
drop policy if exists user_settings_update_own on public.user_settings;

drop policy if exists user_limits_select_own on public.user_limits;
drop policy if exists daily_usage_select_own on public.daily_usage;
drop policy if exists user_index_access_select_own on public.user_index_access;

-- 4) Strict per-table policies for authenticated users.
-- profiles: read/update only own profile (no direct insert/delete).
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- conversations: full CRUD only for owner.
create policy conversations_select_own
on public.conversations
for select
to authenticated
using (auth.uid() = user_id);

create policy conversations_insert_own
on public.conversations
for insert
to authenticated
with check (auth.uid() = user_id);

create policy conversations_update_own
on public.conversations
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy conversations_delete_own
on public.conversations
for delete
to authenticated
using (auth.uid() = user_id);

-- messages: read/insert only own messages tied to own conversation.
-- No update/delete for authenticated to prevent tampering.
create policy messages_select_own
on public.messages
for select
to authenticated
using (
    auth.uid() = user_id
    and exists (
        select 1
        from public.conversations c
        where c.id = conversation_id
          and c.user_id = auth.uid()
    )
);

create policy messages_insert_own
on public.messages
for insert
to authenticated
with check (
    auth.uid() = user_id
    and exists (
        select 1
        from public.conversations c
        where c.id = conversation_id
          and c.user_id = auth.uid()
    )
);

-- user settings: read/update own only.
create policy user_settings_select_own
on public.user_settings
for select
to authenticated
using (auth.uid() = user_id);

create policy user_settings_update_own
on public.user_settings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- limits/usage/index access: read own only (writes are backend/service-managed).
create policy user_limits_select_own
on public.user_limits
for select
to authenticated
using (auth.uid() = user_id);

create policy daily_usage_select_own
on public.daily_usage
for select
to authenticated
using (auth.uid() = user_id);

create policy user_index_access_select_own
on public.user_index_access
for select
to authenticated
using (auth.uid() = user_id);

-- access_requests: no authenticated/anon policy on purpose.
-- Only service_role backend should write/read this table.

-- 5) Privilege hardening.
-- Remove broad grants from anon/authenticated and grant only required rights.
revoke create on schema public from public;
revoke create on schema public from anon;
revoke create on schema public from authenticated;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.conversations from anon, authenticated;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.user_settings from anon, authenticated;
revoke all on table public.user_limits from anon, authenticated;
revoke all on table public.daily_usage from anon, authenticated;
revoke all on table public.user_index_access from anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.conversations to authenticated;
grant select, insert on table public.messages to authenticated;
grant select, update on table public.user_settings to authenticated;
grant select on table public.user_limits to authenticated;
grant select on table public.daily_usage to authenticated;
grant select on table public.user_index_access to authenticated;

-- Backend (service role) retains full access.
grant all on table public.profiles to service_role;
grant all on table public.conversations to service_role;
grant all on table public.messages to service_role;
grant all on table public.user_settings to service_role;
grant all on table public.user_limits to service_role;
grant all on table public.daily_usage to service_role;
grant all on table public.user_index_access to service_role;

-- access_requests is optional across environments.
do $$
begin
    if to_regclass('public.access_requests') is not null then
        execute 'revoke all on table public.access_requests from anon, authenticated';
        execute 'grant all on table public.access_requests to service_role';
    end if;
end $$;

-- 6) Restrict quota RPC execution to service role only.
do $$
begin
    if to_regprocedure('public.consume_daily_quota(uuid,integer)') is not null then
        revoke all on function public.consume_daily_quota(uuid, integer) from public;
        revoke all on function public.consume_daily_quota(uuid, integer) from anon;
        revoke all on function public.consume_daily_quota(uuid, integer) from authenticated;
        grant execute on function public.consume_daily_quota(uuid, integer) to service_role;
    end if;
end $$;
