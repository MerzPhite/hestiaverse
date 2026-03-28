-- Run in Supabase SQL editor (once). Webhooks use the service role; users read their own row.

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'inactive',
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_stripe_customer_idx on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own"
  on public.subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

-- No insert/update/delete for authenticated clients; Worker uses service role and bypasses RLS.

grant usage on schema public to authenticated;
grant select on table public.subscriptions to authenticated;
