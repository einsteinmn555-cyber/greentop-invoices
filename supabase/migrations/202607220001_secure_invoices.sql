-- Green Top secure invoice storage and access policies.
-- Run this migration in the Supabase SQL editor before using the site.

create extension if not exists pgcrypto;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_email text,
  invoice_number text not null,
  file_path text not null,
  file_size bigint,
  notes text,
  secure_token text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_secure_token_format check (secure_token ~ '^[a-f0-9]{64}$'),
  constraint invoices_customer_name_length check (char_length(customer_name) between 1 and 100),
  constraint invoices_number_length check (char_length(invoice_number) between 1 and 80),
  constraint invoices_notes_length check (notes is null or char_length(notes) <= 500),
  constraint invoices_file_size_positive check (file_size is null or file_size > 0)
);

alter table public.invoices add column if not exists customer_email text;
alter table public.invoices add column if not exists file_size bigint;
alter table public.invoices add column if not exists notes text;
alter table public.invoices add column if not exists updated_at timestamptz not null default now();
alter table public.invoices alter column customer_email drop not null;

create unique index if not exists invoices_secure_token_unique
  on public.invoices (secure_token);

create index if not exists invoices_created_at_index
  on public.invoices (created_at desc);

create or replace function public.is_green_top_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@greentaxikw.com';
$$;

revoke all on function public.is_green_top_admin() from public;
grant execute on function public.is_green_top_admin() to anon, authenticated;

create or replace function public.set_invoice_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_invoice_updated_at on public.invoices;
create trigger set_invoice_updated_at
before update on public.invoices
for each row execute function public.set_invoice_updated_at();

alter table public.invoices enable row level security;
alter table public.invoices force row level security;

drop policy if exists "Green Top invoice guard" on public.invoices;
drop policy if exists "Green Top admin invoice access" on public.invoices;

-- Restrictive guard: even if another permissive policy is added later,
-- only the configured Green Top administrator can access this table.
create policy "Green Top invoice guard"
on public.invoices
as restrictive
for all
to public
using (public.is_green_top_admin())
with check (public.is_green_top_admin());

create policy "Green Top admin invoice access"
on public.invoices
as permissive
for all
to authenticated
using (public.is_green_top_admin())
with check (public.is_green_top_admin());

revoke all on table public.invoices from anon;
grant select, insert, update, delete on table public.invoices to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoices',
  'invoices',
  false,
  10485760,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Green Top storage guard" on storage.objects;
drop policy if exists "Green Top admin can read invoice files" on storage.objects;
drop policy if exists "Green Top admin can upload invoice files" on storage.objects;
drop policy if exists "Green Top admin can update invoice files" on storage.objects;
drop policy if exists "Green Top admin can delete invoice files" on storage.objects;

-- This restrictive policy prevents non-admin access to this bucket even if
-- a broad permissive storage policy exists for another bucket.
create policy "Green Top storage guard"
on storage.objects
as restrictive
for all
to public
using (bucket_id <> 'invoices' or public.is_green_top_admin())
with check (bucket_id <> 'invoices' or public.is_green_top_admin());

create policy "Green Top admin can read invoice files"
on storage.objects
for select
to authenticated
using (bucket_id = 'invoices' and public.is_green_top_admin());

create policy "Green Top admin can upload invoice files"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'invoices' and public.is_green_top_admin());

create policy "Green Top admin can update invoice files"
on storage.objects
for update
to authenticated
using (bucket_id = 'invoices' and public.is_green_top_admin())
with check (bucket_id = 'invoices' and public.is_green_top_admin());

create policy "Green Top admin can delete invoice files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'invoices' and public.is_green_top_admin());

comment on table public.invoices is
  'Private Green Top invoices. Customer access is only through the token-validation Edge Function.';
