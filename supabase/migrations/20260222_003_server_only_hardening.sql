-- Extra hardening layer:
-- 1) Make public schema data access server-only (service_role)
-- 2) Enforce stronger data integrity constraints
-- Safe to run multiple times.

-- -------------------------------------------------------------------
-- 1) Privilege hardening: server-only data plane
-- -------------------------------------------------------------------

-- Keep schema usage only for service role (data reads/writes should go through Next.js backend).
revoke usage on schema public from anon;
revoke usage on schema public from authenticated;
grant usage on schema public to service_role;

-- Remove broad object permissions for browser roles.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon;
revoke all on all sequences in schema public from authenticated;
revoke all on all functions in schema public from anon;
revoke all on all functions in schema public from authenticated;
revoke all on all functions in schema public from public;

-- Ensure service role keeps required access.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Lock down defaults for future objects in public schema.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on tables from public;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on sequences from authenticated;
alter default privileges in schema public revoke all on sequences from public;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on functions from authenticated;
alter default privileges in schema public revoke all on functions from public;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- -------------------------------------------------------------------
-- 2) Data integrity hardening
-- -------------------------------------------------------------------

-- Conversations: enforce non-empty/limited titles and bounded index list.
alter table if exists public.conversations
    drop constraint if exists conversations_title_length_check;
alter table if exists public.conversations
    add constraint conversations_title_length_check
    check (char_length(btrim(title)) between 1 and 120);

alter table if exists public.conversations
    drop constraint if exists conversations_active_indexes_limit_check;
alter table if exists public.conversations
    add constraint conversations_active_indexes_limit_check
    check (coalesce(array_length(active_index_names, 1), 0) <= 32);

-- Add explicit composite uniqueness for stronger cross-table FK.
alter table if exists public.conversations
    drop constraint if exists conversations_id_user_unique;
alter table if exists public.conversations
    add constraint conversations_id_user_unique unique (id, user_id);

-- Messages: ensure no blank content and citations are always arrays.
alter table if exists public.messages
    drop constraint if exists messages_content_not_blank_check;
alter table if exists public.messages
    add constraint messages_content_not_blank_check
    check (char_length(btrim(content)) > 0);

alter table if exists public.messages
    drop constraint if exists messages_markdown_not_blank_check;
alter table if exists public.messages
    add constraint messages_markdown_not_blank_check
    check (char_length(btrim(markdown_content)) > 0);

alter table if exists public.messages
    drop constraint if exists messages_citations_is_array_check;
alter table if exists public.messages
    add constraint messages_citations_is_array_check
    check (jsonb_typeof(citations) = 'array');

-- Enforce user ownership consistency between message and conversation.
alter table if exists public.messages
    drop constraint if exists messages_conversation_user_fkey;
alter table if exists public.messages
    add constraint messages_conversation_user_fkey
    foreign key (conversation_id, user_id)
    references public.conversations (id, user_id)
    on delete cascade;

-- User settings: keep values in safe ranges.
alter table if exists public.user_settings
    drop constraint if exists user_settings_top_k_range_check;
alter table if exists public.user_settings
    add constraint user_settings_top_k_range_check
    check (top_k between 1 and 100);

alter table if exists public.user_settings
    drop constraint if exists user_settings_temperature_range_check;
alter table if exists public.user_settings
    add constraint user_settings_temperature_range_check
    check (temperature >= 0 and temperature <= 1);

-- access_requests table is optional per environment.
do $$
begin
    if to_regclass('public.access_requests') is not null then
        execute 'alter table public.access_requests drop constraint if exists access_requests_status_check';
        execute $sql$
            alter table public.access_requests
            add constraint access_requests_status_check
            check (status in ('pending', 'approved', 'rejected'))
        $sql$;
    end if;
end $$;
