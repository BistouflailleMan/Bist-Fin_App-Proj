-- Appli Finance — schéma Supabase (ré-exécutable sans risque)
-- À coller dans Supabase > SQL Editor puis « Run ».

create table if not exists public.items (
  user_id    uuid    not null default auth.uid() references auth.users on delete cascade,
  id         text    not null,
  type       text    not null check (type in ('expense','income','category','settings')),
  data       jsonb,
  deleted    boolean not null default false,
  updated_at bigint  not null,
  server_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists items_user_server_at_idx
  on public.items (user_id, server_at);

-- Sécurité : chacun ne voit et n'écrit que ses propres lignes. Aucune suppression possible.
alter table public.items enable row level security;

drop policy if exists "items_select_own" on public.items;
create policy "items_select_own" on public.items
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "items_insert_own" on public.items;
create policy "items_insert_own" on public.items
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "items_update_own" on public.items;
create policy "items_update_own" on public.items
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Le plus récent gagne + horodatage serveur (curseur de lecture)
create or replace function public.items_lww()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists items_lww_trg on public.items;
create trigger items_lww_trg
  before insert or update on public.items
  for each row execute function public.items_lww();
