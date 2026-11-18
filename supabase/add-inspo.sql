-- ============================================================
--  Wardrobe — inspo saved against an outfit
--
--  Paste this into the Supabase SQL editor and press Run.
--
--  Inspo is a picture of someone wearing something like an outfit: a
--  photo or screenshot you upload, or a link to any image or page. It
--  hangs off the combination (combo_key), the same as accessories do,
--  so it is there whether or not the outfit has been kept.
--
--  Photos live in the existing private wardrobe-uploads bucket under
--  inspo/, so nothing here makes a picture public. A link keeps the
--  address you pasted and, where the page has one, the preview picture
--  found for it.
--
--  Nothing is ever hard-deleted: removing inspo sets archived_at, which
--  is also what Undo clears.
--
--  Safe to run more than once.
-- ============================================================

create table if not exists public.outfit_inspo (
  id          text primary key,
  combo_key   text        not null,
  kind        text        not null check (kind in ('photo', 'link')),
  url         text,                 -- the address pasted, for kind 'link'
  image_path  text,                 -- Storage path in wardrobe-uploads, for photos
  image_url   text,                 -- a link's preview picture, if one was found
  source      text        not null default '',   -- the site name shown on the tile
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists outfit_inspo_combo_key_idx on public.outfit_inspo (combo_key);

alter table public.outfit_inspo enable row level security;

drop policy if exists outfit_inspo_authenticated_all on public.outfit_inspo;
create policy outfit_inspo_authenticated_all on public.outfit_inspo
  for all to authenticated using (true) with check (true);
