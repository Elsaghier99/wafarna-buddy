-- Run this in Supabase SQL Editor
-- Go to: supabase.com → your project → SQL Editor → New Query → paste this → Run

CREATE TABLE IF NOT EXISTS user_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  date date DEFAULT CURRENT_DATE,
  message_count integer DEFAULT 0,
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS user_searches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  query text NOT NULL,
  category text,
  country text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_clicks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  store_name text,
  store_url text,
  category text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_watchlist (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  query text NOT NULL,
  category text,
  country text,
  last_alerted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_watchlist ENABLE ROW LEVEL SECURITY;

-- Policies: users can only see their own data
CREATE POLICY "Users see own usage" ON user_usage FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own searches" ON user_searches FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own clicks" ON user_clicks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own watchlist" ON user_watchlist FOR ALL USING (auth.uid() = user_id);
