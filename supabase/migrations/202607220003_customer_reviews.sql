-- Green Top customer reviews: private records with a validated public submit function.

create table if not exists public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  overall_rating smallint not null,
  punctuality_rating smallint not null,
  captain_rating smallint not null,
  car_rating smallint not null,
  booking_rating smallint not null,
  extra_charge boolean not null default false,
  extra_charge_details text,
  off_platform_offer boolean not null default false,
  off_platform_details text,
  use_again text not null,
  recommend text not null,
  discovery_source text,
  notes text,
  created_at timestamptz not null default now(),
  constraint customer_reviews_phone_format check (phone ~ '^[0-9]{8,15}$'),
  constraint customer_reviews_overall_rating check (overall_rating between 1 and 5),
  constraint customer_reviews_punctuality_rating check (punctuality_rating between 1 and 5),
  constraint customer_reviews_captain_rating check (captain_rating between 1 and 5),
  constraint customer_reviews_car_rating check (car_rating between 1 and 5),
  constraint customer_reviews_booking_rating check (booking_rating between 1 and 5),
  constraint customer_reviews_extra_details_length check (extra_charge_details is null or char_length(extra_charge_details) <= 500),
  constraint customer_reviews_off_platform_details_length check (off_platform_details is null or char_length(off_platform_details) <= 500),
  constraint customer_reviews_use_again_values check (use_again in ('yes', 'maybe', 'no')),
  constraint customer_reviews_recommend_values check (recommend in ('yes', 'maybe', 'no')),
  constraint customer_reviews_discovery_values check (
    discovery_source is null or discovery_source in ('google', 'website', 'social', 'referral', 'returning', 'other')
  ),
  constraint customer_reviews_notes_length check (notes is null or char_length(notes) <= 1500)
);

create index if not exists customer_reviews_created_at_index
  on public.customer_reviews (created_at desc);

create index if not exists customer_reviews_phone_index
  on public.customer_reviews (phone);

alter table public.customer_reviews enable row level security;
alter table public.customer_reviews force row level security;

drop policy if exists "Green Top review guard" on public.customer_reviews;
drop policy if exists "Green Top admin review access" on public.customer_reviews;

create policy "Green Top review guard"
on public.customer_reviews
as restrictive
for all
to public
using (public.is_green_top_admin())
with check (public.is_green_top_admin());

create policy "Green Top admin review access"
on public.customer_reviews
as permissive
for select
to authenticated
using (public.is_green_top_admin());

revoke all on table public.customer_reviews from anon, authenticated;
grant select on table public.customer_reviews to authenticated;

create or replace function public.submit_customer_review(
  p_phone text,
  p_overall_rating smallint,
  p_punctuality_rating smallint,
  p_captain_rating smallint,
  p_car_rating smallint,
  p_booking_rating smallint,
  p_extra_charge boolean,
  p_extra_charge_details text,
  p_off_platform_offer boolean,
  p_off_platform_details text,
  p_use_again text,
  p_recommend text,
  p_discovery_source text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_phone text;
  review_id uuid;
begin
  normalized_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  if normalized_phone !~ '^[0-9]{8,15}$' then
    raise exception using errcode = '22023', message = 'invalid_phone';
  end if;

  if p_overall_rating not between 1 and 5
    or p_punctuality_rating not between 1 and 5
    or p_captain_rating not between 1 and 5
    or p_car_rating not between 1 and 5
    or p_booking_rating not between 1 and 5 then
    raise exception using errcode = '22023', message = 'invalid_rating';
  end if;

  if p_extra_charge is null or p_off_platform_offer is null then
    raise exception using errcode = '22023', message = 'missing_safety_answer';
  end if;

  if p_use_again not in ('yes', 'maybe', 'no') or p_recommend not in ('yes', 'maybe', 'no') then
    raise exception using errcode = '22023', message = 'invalid_choice';
  end if;

  if p_discovery_source is not null
    and p_discovery_source not in ('google', 'website', 'social', 'referral', 'returning', 'other') then
    raise exception using errcode = '22023', message = 'invalid_source';
  end if;

  if char_length(coalesce(p_extra_charge_details, '')) > 500
    or char_length(coalesce(p_off_platform_details, '')) > 500
    or char_length(coalesce(p_notes, '')) > 1500 then
    raise exception using errcode = '22023', message = 'text_too_long';
  end if;

  insert into public.customer_reviews (
    phone,
    overall_rating,
    punctuality_rating,
    captain_rating,
    car_rating,
    booking_rating,
    extra_charge,
    extra_charge_details,
    off_platform_offer,
    off_platform_details,
    use_again,
    recommend,
    discovery_source,
    notes
  ) values (
    normalized_phone,
    p_overall_rating,
    p_punctuality_rating,
    p_captain_rating,
    p_car_rating,
    p_booking_rating,
    p_extra_charge,
    case when p_extra_charge then nullif(trim(p_extra_charge_details), '') else null end,
    p_off_platform_offer,
    case when p_off_platform_offer then nullif(trim(p_off_platform_details), '') else null end,
    p_use_again,
    p_recommend,
    nullif(trim(p_discovery_source), ''),
    nullif(trim(p_notes), '')
  )
  returning id into review_id;

  return review_id;
end;
$$;

revoke all on function public.submit_customer_review(
  text, smallint, smallint, smallint, smallint, smallint,
  boolean, text, boolean, text, text, text, text, text
) from public;

grant execute on function public.submit_customer_review(
  text, smallint, smallint, smallint, smallint, smallint,
  boolean, text, boolean, text, text, text, text, text
) to anon, authenticated;

comment on table public.customer_reviews is
  'Private Green Top customer feedback. Public submissions are accepted only through the validated RPC function.';
