-- ============================================================
--  The Archive — wardrobe database schema
--  Run this once in the Supabase SQL editor (see SETUP.md).
--  Safe to re-run: every statement is idempotent.
-- ============================================================

-- ------------------------------------------------------------
--  Items
--
--  id is TEXT, not a uuid, on purpose: the seeded rows keep the
--  'seed_N' ids the app already used in localStorage, so saved
--  outfits and hidden combos (which are keyed on item ids) carry
--  over without any remapping. New items get 'itm_<uuid>'.
--
--  Nothing is ever hard-deleted. archived_at is the soft delete:
--  null = active, a timestamp = archived and restorable.
-- ------------------------------------------------------------
create table if not exists public.items (
  id          text primary key,
  name        text        not null,
  brand       text        not null default '',
  size        text        not null default '',
  category    text        not null default '',
  price       text        not null default '',
  source      text        not null default '',
  notes       text        not null default '',
  photo       text,                  -- static path committed in the repo (wardrobe-photos/...)
  photo_path  text,                  -- Supabase Storage object path; takes precedence over photo
  archived_at timestamptz,           -- soft delete: null = active
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists items_archived_at_idx on public.items (archived_at);

-- ------------------------------------------------------------
--  Saved (hearted) outfits
--
--  combo_key is the app's own stable key for a combination,
--  e.g. 'tb|seed_22|seed_11|none|none|none'. It is the natural
--  primary key: one row per combination.
--
--  The per-slot ids are stored alongside so an outfit can be
--  rebuilt even if the key format ever changes. on delete set
--  null rather than cascade — an outfit should degrade, never
--  vanish, and in practice items are archived, not deleted.
-- ------------------------------------------------------------
create table if not exists public.saved_outfits (
  combo_key   text primary key,
  base        text        not null check (base in ('topbottom', 'dress')),
  top_id      text references public.items(id) on delete set null,
  bottom_id   text references public.items(id) on delete set null,
  dress_id    text references public.items(id) on delete set null,
  jumper_id   text references public.items(id) on delete set null,
  jacket_id   text references public.items(id) on delete set null,
  shoe_id     text references public.items(id) on delete set null,
  archived_at timestamptz,           -- un-hearting soft-deletes too; nothing is lost
  created_at  timestamptz not null default now()
);

create index if not exists saved_outfits_archived_at_idx on public.saved_outfits (archived_at);

-- ------------------------------------------------------------
--  Combinations dismissed from the outfit generator
-- ------------------------------------------------------------
create table if not exists public.hidden_combos (
  combo_key  text primary key,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
--  Keep items.updated_at honest
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_touch_updated_at on public.items;
create trigger items_touch_updated_at
  before update on public.items
  for each row execute function public.touch_updated_at();

-- ============================================================
--  Row level security
--
--  The anon key is public — it ships in the page source — so it
--  must not be able to read or write anything on its own. Every
--  policy below requires a signed-in session, which is what the
--  password screen actually establishes. Anonymous requests get
--  an empty result set, not the wardrobe.
-- ============================================================
alter table public.items         enable row level security;
alter table public.saved_outfits enable row level security;
alter table public.hidden_combos enable row level security;

drop policy if exists items_authenticated_all on public.items;
create policy items_authenticated_all on public.items
  for all to authenticated using (true) with check (true);

drop policy if exists saved_outfits_authenticated_all on public.saved_outfits;
create policy saved_outfits_authenticated_all on public.saved_outfits
  for all to authenticated using (true) with check (true);

drop policy if exists hidden_combos_authenticated_all on public.hidden_combos;
create policy hidden_combos_authenticated_all on public.hidden_combos
  for all to authenticated using (true) with check (true);

-- ============================================================
--  Storage bucket for photos uploaded from the app
--
--  The 68 photos already committed to the repo keep being served
--  as static files; this bucket is only for new uploads, which
--  previously tried to live in localStorage as base64 and quietly
--  blew the ~5MB quota.
-- ============================================================
--  Both blocks below swallow their own errors on purpose. The SQL editor
--  runs a script as one transaction, so an error here would roll back the
--  tables above with it and leave the app reporting that public.items does
--  not exist. Photo uploads are the only thing that depends on this, so a
--  failure should cost you uploads, not the whole wardrobe.
do $$
begin
  insert into storage.buckets (id, name, public)
  values ('wardrobe-uploads', 'wardrobe-uploads', false)
  on conflict (id) do nothing;
exception when others then
  raise warning 'Storage bucket not created (%). Everything except photo uploads still works.', sqlerrm;
end $$;

do $$
begin
  drop policy if exists wardrobe_uploads_authenticated_all on storage.objects;
  create policy wardrobe_uploads_authenticated_all on storage.objects
    for all to authenticated
    using (bucket_id = 'wardrobe-uploads')
    with check (bucket_id = 'wardrobe-uploads');
exception when others then
  raise warning 'Storage policy not created (%). Everything except photo uploads still works.', sqlerrm;
end $$;
