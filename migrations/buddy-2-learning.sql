-- Buddy 2.0 learning layer. Apply manually in a STAGING Supabase project first.
create table if not exists public.buddy_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 memory_enabled boolean not null default false,
 preferences jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
create table if not exists public.buddy_feedback (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 search_query text not null,
 rating text not null check (rating in ('helpful','not_helpful')),
 country text,
 created_at timestamptz not null default now()
);
alter table public.buddy_preferences enable row level security;
alter table public.buddy_feedback enable row level security;
drop policy if exists "buddy_preferences_own" on public.buddy_preferences;
create policy "buddy_preferences_own" on public.buddy_preferences
 for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "buddy_feedback_own" on public.buddy_feedback;
create policy "buddy_feedback_own" on public.buddy_feedback
 for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists buddy_feedback_user_recent on public.buddy_feedback(user_id, created_at desc);
-- Existing user_searches/user_clicks remain unchanged; migrate retention rules separately.
