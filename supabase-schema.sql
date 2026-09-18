create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  excerpt text not null,
  body text not null,
  post_type text not null default 'Essay',
  category text not null default 'Essays',
  author text not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  read_time integer not null default 1,
  image text, 
  created_at timestamptz not null default now()
);

alter table public.posts add column if not exists post_type text not null default 'Essay';

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;
alter table public.subscribers enable row level security;

drop policy if exists "Anyone can read posts" on public.posts;
drop policy if exists "Signed in users can publish posts" on public.posts;
drop policy if exists "Anyone can subscribe" on public.subscribers;

create policy "Anyone can read posts" on public.posts for select using (true);
create policy "Signed in users can publish posts" on public.posts for insert to authenticated with check (auth.uid() = author_id);
create policy "Anyone can subscribe" on public.subscribers for insert to anon, authenticated with check (true);

insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can read cover images" on storage.objects;
drop policy if exists "Signed in users can upload cover images" on storage.objects;
drop policy if exists "Users can update their cover images" on storage.objects;
drop policy if exists "Users can delete their cover images" on storage.objects;

create policy "Anyone can read cover images" on storage.objects for select using (bucket_id = 'covers');
create policy "Signed in users can upload cover images" on storage.objects for insert to authenticated with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can update their cover images" on storage.objects for update to authenticated using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete their cover images" on storage.objects for delete to authenticated using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);