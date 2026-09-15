-- ============================================================
--  The Archive — add capsules
--
--  Already applied to the live database. This file exists so a
--  rebuilt database gets the same thing, and so the change is
--  readable in the repo rather than only in Supabase.
--
--  Safe to run more than once: it only adds tables and policies.
--
--  Until it runs the app simply hides the Capsules destination,
--  so nothing breaks either way.
-- ============================================================

-- A piece belongs to any number of capsules, so membership is a join
-- table rather than a column on items.
create table if not exists public.capsules (
  id          text primary key,
  name        text        not null,
  archived_at timestamptz,           -- soft delete: null = active
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists capsules_archived_at_idx on public.capsules (archived_at);

create table if not exists public.capsule_items (
  capsule_id text not null references public.capsules(id) on delete cascade,
  item_id    text not null references public.items(id)    on delete cascade,
  created_at timestamptz not null default now(),
  primary key (capsule_id, item_id)
);

-- "Which capsules is this piece in?" without scanning every membership.
create index if not exists capsule_items_item_id_idx on public.capsule_items (item_id);

drop trigger if exists capsules_touch_updated_at on public.capsules;
create trigger capsules_touch_updated_at
  before update on public.capsules
  for each row execute function public.touch_updated_at();

alter table public.capsules      enable row level security;
alter table public.capsule_items enable row level security;

drop policy if exists capsules_authenticated_all on public.capsules;
create policy capsules_authenticated_all on public.capsules
  for all to authenticated using (true) with check (true);

drop policy if exists capsule_items_authenticated_all on public.capsule_items;
create policy capsule_items_authenticated_all on public.capsule_items
  for all to authenticated using (true) with check (true);
