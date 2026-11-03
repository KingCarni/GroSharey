-- Minimal stand-ins for the Supabase-managed objects the GroSharey migrations depend on, so
-- the migrations and the entitlement regression suite can run against plain PostgreSQL.
-- This file is test-only and is never applied to a real Supabase project.

create role anon;
create role authenticated;
create role service_role;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- Tests choose the acting user with: select set_config('test.user_id', '<uuid>', false);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('test.user_id', true), '')::uuid;
$$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

create publication supabase_realtime;
