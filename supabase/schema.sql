-- ============================================================
-- pickNdrop — Supabase Schema
-- Run this once in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- files: one row per completed S3 upload
-- ============================================================
create table if not exists files (
  id            uuid primary key default gen_random_uuid(),
  original_name text        not null,
  s3_key        text        not null unique,
  size_bytes    bigint      not null,
  mime_type     text,
  upload_id     text,           -- S3 multipart upload ID (cleared after complete)
  is_complete   boolean     default false,
  created_at    timestamptz default now()
);

-- ============================================================
-- share_links: security settings for each shared file
-- ============================================================
create table if not exists share_links (
  id             uuid primary key default gen_random_uuid(),
  file_id        uuid        references files(id) on delete cascade,
  token          text        unique not null,
  password_hash  text,                    -- null = no password required
  max_downloads  int,                     -- null = unlimited
  download_count int         default 0,
  expires_at     timestamptz,             -- null = never expires
  allowed_ips    text[],                  -- null = allow all IPs
  blocked_ips    text[],                  -- null = block no IPs
  created_at     timestamptz default now()
);

create index if not exists share_links_token_idx on share_links(token);

-- ============================================================
-- download_log: immutable audit trail
-- ============================================================
create table if not exists download_log (
  id              uuid primary key default gen_random_uuid(),
  share_link_id   uuid        references share_links(id) on delete cascade,
  ip              text,
  user_agent      text,
  downloaded_at   timestamptz default now()
);

create index if not exists download_log_share_link_idx on download_log(share_link_id);

-- ============================================================
-- Row Level Security (disable for service role key usage)
-- ============================================================
alter table files         disable row level security;
alter table share_links   disable row level security;
alter table download_log  disable row level security;
