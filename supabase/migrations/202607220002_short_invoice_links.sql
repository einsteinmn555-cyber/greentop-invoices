-- Add compact, unguessable customer links while keeping legacy secure-token links valid.

alter table public.invoices
  add column if not exists short_code text;

-- A UUID v4 is hashed before taking 96 random bits. Twelve bytes encode to
-- exactly 16 URL-safe Base64 characters without padding.
update public.invoices
set short_code = translate(
  encode(
    substring(sha256(uuid_send(gen_random_uuid())) from 1 for 12),
    'base64'
  ),
  '+/',
  '-_'
)
where short_code is null;

alter table public.invoices
  alter column short_code set default translate(
    encode(
      substring(sha256(uuid_send(gen_random_uuid())) from 1 for 12),
      'base64'
    ),
    '+/',
    '-_'
  );

alter table public.invoices
  alter column short_code set not null;

create unique index if not exists invoices_short_code_unique
  on public.invoices (short_code);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_short_code_format'
  ) then
    alter table public.invoices
      add constraint invoices_short_code_format
      check (short_code ~ '^[A-Za-z0-9_-]{16}$');
  end if;
end
$$;

comment on column public.invoices.short_code is
  'Random 96-bit URL-safe identifier used by compact customer invoice links.';
