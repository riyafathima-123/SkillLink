/*
 * SkillLink Database Schema
 * Run this SQL in Supabase SQL Editor
 */

create extension if not exists "uuid-ossp";

-- Users table: Store user profiles
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  full_name text,
  email text unique not null,
  bio text,
  avatar_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Skills table: Skills offered by users
create table if not exists skills (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references users(id) on delete cascade,
  title text not null,
  description text,
  price numeric(10, 2) default 0,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Connections table: Learning connections between users
create table if not exists connections (
  id uuid primary key default uuid_generate_v4(),
  skill_id uuid not null references skills(id) on delete cascade,
  learner_id uuid not null references users(id) on delete cascade,
  teacher_id uuid not null references users(id) on delete cascade,
  price numeric(10, 2) not null,
  status text default 'pending' check (status in ('pending', 'accepted', 'rejected', 'completed')),
  message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Reviews table: Ratings for completed connections
create table if not exists reviews (
  id uuid primary key default uuid_generate_v4(),
  connection_id uuid not null references connections(id) on delete cascade,
  reviewer_id uuid not null references users(id),
  rating smallint not null check (rating >= 1 and rating <= 5),
  comment text,
  created_at timestamptz default now()
);

-- Wallets table: User credit balances
create table if not exists wallets (
  user_id uuid primary key references users(id) on delete cascade,
  balance numeric(12, 2) default 0,
  updated_at timestamptz default now()
);

-- Credit transactions table: Track all credit movements
create table if not exists credit_transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('purchase', 'spend', 'refund')),
  amount numeric(12, 2) not null,
  meta jsonb,
  created_at timestamptz default now()
);

-- Create indexes for performance
create index if not exists idx_skills_owner on skills(owner_id);
create index if not exists idx_skills_title on skills using gin(to_tsvector('english', title));
create index if not exists idx_connections_learner on connections(learner_id);
create index if not exists idx_connections_teacher on connections(teacher_id);
create index if not exists idx_connections_skill on connections(skill_id);
create index if not exists idx_connections_status on connections(status);
create index if not exists idx_transactions_user on credit_transactions(user_id);
create index if not exists idx_transactions_type on credit_transactions(type);