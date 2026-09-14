-- ============================================================
--  The Archive — add tags to items
--
--  Paste this into the Supabase SQL editor and press Run.
--  It is two statements and takes a second.
--
--  Safe to run more than once, and it touches nothing that
--  already exists: it only adds a column and an index.
--
--  Until you run it the app simply hides the tag controls, so
--  nothing breaks either way.
-- ============================================================

alter table public.items
  add column if not exists tags text[] not null default '{}';

-- Makes "show me everything tagged summer" an index lookup rather
-- than a scan of every row.
create index if not exists items_tags_idx on public.items using gin (tags);
