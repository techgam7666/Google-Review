-- ============================================================================
-- ReviewEase AI — Supabase PostgreSQL Schema & Row Level Security (RLS)
-- Paste into Supabase Dashboard -> SQL Editor -> New Query -> Click "Run"
-- Project: https://supabase.com/dashboard/project/qfftaewsktgvwuqoomsn/sql/new
-- ============================================================================

-- 1. Helper function to check Founder Admin email from verified Supabase JWT
create or replace function public.is_founder_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'techgam766@gmail.com';
$$;

-- 2. Merchant SaaS Subscriptions Table
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_label text not null check (char_length(account_label) between 1 and 80),
  plan_id text not null check (plan_id in ('trial', 'starter', 'growth', 'agency')),
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'paused')),
  max_businesses integer not null default 1 check (max_businesses between 1 and 25),
  price_inr integer not null default 0 check (price_inr between 0 and 500000),
  payment_reference text not null default '' check (char_length(payment_reference) <= 80),
  current_period_end_ms bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Subscribed Local Businesses / Shop QR Scanners Table
create table if not exists public.businesses (
  slug text primary key check (char_length(slug) between 2 and 60 and slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (char_length(category) between 1 and 60),
  location_label text not null default '' check (char_length(location_label) <= 80),
  google_review_url text not null check (char_length(google_review_url) between 10 and 500 and google_review_url ~ '^https?://.+'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  plan_id text not null default 'starter' check (plan_id in ('trial', 'starter', 'growth', 'agency')),
  subscription_ends_at_ms bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_businesses_owner_id on public.businesses(owner_id);

-- 4. Anonymous Customer QR Scan & Review Session Telemetry Table
create table if not exists public.review_sessions (
  id text primary key check (char_length(id) between 3 and 128),
  business_slug text not null references public.businesses(slug) on delete cascade,
  business_owner_id uuid not null,
  visit_id text not null check (char_length(visit_id) between 3 and 64),
  rating integer not null check (rating between 1 and 5),
  language text not null check (language in ('English', 'Hindi', 'Hinglish')),
  used_optional_prompts boolean not null default false,
  stage text not null check (stage in ('draft_generated', 'copied_review', 'opened_google')),
  created_at timestamptz not null default now()
);

create index if not exists idx_review_sessions_slug_created on public.review_sessions(business_slug, created_at desc);
create index if not exists idx_review_sessions_owner on public.review_sessions(business_owner_id);

-- 5. Platform Billing Configuration Table (Founder UPI ID & Payment Links)
create table if not exists public.platform_settings (
  id text primary key check (id = 'billing'),
  upi_id text not null default '' check (char_length(upi_id) <= 80),
  payee_name text not null default 'ReviewEase AI' check (char_length(payee_name) between 1 and 80),
  payment_link_starter text not null default '' check (char_length(payment_link_starter) <= 300),
  payment_link_growth text not null default '' check (char_length(payment_link_growth) <= 300),
  payment_link_agency text not null default '' check (char_length(payment_link_agency) <= 300),
  support_contact text not null default '' check (char_length(support_contact) <= 80),
  trial_days integer not null default 7 check (trial_days between 0 and 30),
  updated_by_uid text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id, payee_name, trial_days)
values ('billing', 'ReviewEase AI', 7)
on conflict (id) do nothing;

-- ============================================================================
-- Enable Row Level Security (RLS)
-- ============================================================================
alter table public.subscriptions enable row level security;
alter table public.businesses enable row level security;
alter table public.review_sessions enable row level security;
alter table public.platform_settings enable row level security;

-- Subscriptions Policies
drop policy if exists "subscriptions_select_own_or_admin" on public.subscriptions;
create policy "subscriptions_select_own_or_admin"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id or public.is_founder_admin());

drop policy if exists "subscriptions_insert_own_or_admin" on public.subscriptions;
create policy "subscriptions_insert_own_or_admin"
  on public.subscriptions for insert
  to authenticated
  with check (auth.uid() = user_id or public.is_founder_admin());

drop policy if exists "subscriptions_update_own_or_admin" on public.subscriptions;
create policy "subscriptions_update_own_or_admin"
  on public.subscriptions for update
  to authenticated
  using ((auth.uid() = user_id and status <> 'paused') or public.is_founder_admin())
  with check (auth.uid() = user_id or public.is_founder_admin());

drop policy if exists "subscriptions_delete_admin" on public.subscriptions;
create policy "subscriptions_delete_admin"
  on public.subscriptions for delete
  to authenticated
  using (public.is_founder_admin());

-- Businesses Policies
drop policy if exists "businesses_public_select_by_slug" on public.businesses;
create policy "businesses_public_select_by_slug"
  on public.businesses for select
  to anon, authenticated
  using (is_active = true or auth.uid() = owner_id or public.is_founder_admin());

drop policy if exists "businesses_insert_subscribed_owner" on public.businesses;
create policy "businesses_insert_subscribed_owner"
  on public.businesses for insert
  to authenticated
  with check (
    (
      auth.uid() = owner_id
      and exists (
        select 1 from public.subscriptions s
        where s.user_id = auth.uid()
          and s.status in ('active', 'trialing')
      )
    )
    or public.is_founder_admin()
  );

drop policy if exists "businesses_update_owner_or_admin" on public.businesses;
create policy "businesses_update_owner_or_admin"
  on public.businesses for update
  to authenticated
  using (auth.uid() = owner_id or public.is_founder_admin())
  with check (auth.uid() = owner_id or public.is_founder_admin());

drop policy if exists "businesses_delete_owner_or_admin" on public.businesses;
create policy "businesses_delete_owner_or_admin"
  on public.businesses for delete
  to authenticated
  using (auth.uid() = owner_id or public.is_founder_admin());

-- Review Sessions Policies (Public anonymous QR scan insert + Owner/Admin select)
drop policy if exists "review_sessions_public_insert" on public.review_sessions;
create policy "review_sessions_public_insert"
  on public.review_sessions for insert
  to anon, authenticated
  with check (
    exists (
      select 1 from public.businesses b
      where b.slug = business_slug
        and b.owner_id = business_owner_id
        and b.is_active = true
    )
  );

drop policy if exists "review_sessions_owner_select" on public.review_sessions;
create policy "review_sessions_owner_select"
  on public.review_sessions for select
  to authenticated
  using (auth.uid() = business_owner_id or public.is_founder_admin());

-- Platform Settings Policies
drop policy if exists "platform_settings_authenticated_select" on public.platform_settings;
create policy "platform_settings_authenticated_select"
  on public.platform_settings for select
  to authenticated
  using (true);

drop policy if exists "platform_settings_admin_write" on public.platform_settings;
create policy "platform_settings_admin_write"
  on public.platform_settings for all
  to authenticated
  using (public.is_founder_admin())
  with check (public.is_founder_admin());

-- Enable Realtime updates safely
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'subscriptions'
  ) then
    alter publication supabase_realtime add table public.subscriptions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'businesses'
  ) then
    alter publication supabase_realtime add table public.businesses;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'review_sessions'
  ) then
    alter publication supabase_realtime add table public.review_sessions;
  end if;
end $$;
