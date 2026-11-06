-- Run this once in Supabase Dashboard > SQL Editor.
-- The bucket is public for image delivery only. Upload authorization is
-- issued by the Vercel server after checking the signed admin session.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'skin-images',
  'skin-images',
  true,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No anonymous INSERT, UPDATE, or DELETE policy is created.
-- Only the server-side service-role key may create signed upload URLs.


-- Shared hero/skin catalog. The API accesses this table with the server-only
-- Supabase service-role key; no public table policies are created.
create table if not exists public.skin_catalog (
  id integer primary key check (id = 1),
  catalog jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.skin_catalog enable row level security;
