-- ============================================================
-- EXISTING TABLES (original schema kept intact)
-- ============================================================
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
  private_image_path text,
  status text not null default 'published' check (status in ('draft', 'published')),
  is_featured boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.posts add column if not exists post_type text not null default 'Essay';
alter table public.posts add column if not exists private_image_path text;
alter table public.posts add column if not exists status text not null default 'published';
alter table public.posts add column if not exists is_featured boolean not null default false;
alter table public.posts add column if not exists published_at timestamptz;
update public.posts
set published_at = created_at
where status = 'published' and published_at is null;
alter table public.posts drop constraint if exists posts_status_check;
alter table public.posts add constraint posts_status_check check (status in ('draft', 'published'));
alter table public.posts drop constraint if exists posts_private_image_path_check;
alter table public.posts add constraint posts_private_image_path_check
  check (status = 'draft' or private_image_path is null);
alter table public.posts drop constraint if exists posts_published_content_check;
alter table public.posts add constraint posts_published_content_check
  check (
    (status = 'published' and published_at is not null and private_image_path is null)
    or (status = 'draft' and published_at is null and not is_featured)
  );

create index if not exists posts_published_at_idx
  on public.posts (published_at desc)
  where status = 'published';

create or replace function public.set_post_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'published' then
      new.published_at := coalesce(new.published_at, now());
    else
      new.published_at := null;
    end if;
  elsif old.status = 'draft' and new.status = 'published' then
    new.published_at := now();
  elsif old.status = 'published' and new.status = 'published' then
    new.published_at := old.published_at;
  else
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists set_post_published_at on public.posts;
create trigger set_post_published_at
before insert or update of status, published_at on public.posts
for each row execute function public.set_post_published_at();

create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.subscribers add column if not exists unsubscribe_token uuid default gen_random_uuid();
alter table public.subscribers add column if not exists unsubscribed_at timestamptz;
create unique index if not exists subscribers_unsubscribe_token_key
  on public.subscribers (unsubscribe_token);
alter table public.subscribers alter column unsubscribe_token set not null;

create table if not exists public.newsletter_digests (
  digest_month date primary key,
  status text not null check (status in ('sending', 'sent', 'failed')),
  subscriber_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text
);

create table if not exists public.newsletter_deliveries (
  digest_month date not null references public.newsletter_digests(digest_month) on delete cascade,
  subscriber_id uuid not null references public.subscribers(id) on delete cascade,
  status text not null check (status in ('sent', 'failed')),
  sent_at timestamptz,
  last_error text,
  primary key (digest_month, subscriber_id)
);

alter table public.posts enable row level security;
alter table public.subscribers enable row level security;
alter table public.newsletter_digests enable row level security;
alter table public.newsletter_deliveries enable row level security;

drop policy if exists "Anyone can read posts" on public.posts;
drop policy if exists "Signed in users can publish posts" on public.posts;
drop policy if exists "Public and authors can read posts" on public.posts;
drop policy if exists "Authors can publish posts" on public.posts;
drop policy if exists "Authors can update their posts" on public.posts;
drop policy if exists "Authors can delete their posts" on public.posts;
drop policy if exists "Anyone can subscribe" on public.subscribers;

create policy "Public and authors can read posts"
  on public.posts for select
  using (status = 'published' or (auth.uid() is not null and auth.uid() = author_id));

create policy "Authors can publish posts"
  on public.posts for insert to authenticated
  with check (auth.uid() = author_id and status in ('draft', 'published'));

create policy "Authors can update their posts"
  on public.posts for update to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id and status in ('draft', 'published'));

create policy "Authors can delete their posts"
  on public.posts for delete to authenticated
  using (auth.uid() = author_id);

create policy "Anyone can subscribe" on public.subscribers for insert to anon, authenticated with check (true);

create or replace function public.subscribe_to_monthly_digest(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(p_email));
begin
  if normalized_email is null
    or length(normalized_email) > 254
    or normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  then
    raise exception 'Enter a valid email address.';
  end if;

  insert into public.subscribers (email)
  values (normalized_email)
  on conflict (email) do update
  set unsubscribed_at = null;
end;
$$;

revoke all on function public.subscribe_to_monthly_digest(text) from public;
grant execute on function public.subscribe_to_monthly_digest(text) to anon, authenticated;

-- ============================================================
-- NEW: PROFILES TABLE
-- Public writer profile data. Created/updated on sign-in.
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  bio text,
  website text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Anyone can read profiles" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Anyone can read profiles"
  on public.profiles for select using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id);

-- Keep any existing follows table untouched for compatibility with older data.
-- Fieldnotes now uses mutual friend requests instead of one-way follows.
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  pair_low uuid generated always as (least(requester_id, recipient_id)) stored,
  pair_high uuid generated always as (greatest(requester_id, recipient_id)) stored,
  check (requester_id <> recipient_id)
);

create unique index if not exists friend_requests_one_active_pair
  on public.friend_requests (pair_low, pair_high)
  where status in ('pending', 'accepted');
create index if not exists friend_requests_recipient_pending
  on public.friend_requests (recipient_id, created_at desc)
  where status = 'pending';

alter table public.friend_requests enable row level security;

drop policy if exists "Participants can read friend requests" on public.friend_requests;
drop policy if exists "Users can send friend requests" on public.friend_requests;
drop policy if exists "Participants can remove requests or friendships" on public.friend_requests;

create policy "Participants can read friend requests"
  on public.friend_requests for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = recipient_id);

create policy "Users can send friend requests"
  on public.friend_requests for insert to authenticated
  with check (
    auth.uid() = requester_id
    and requester_id <> recipient_id
    and status = 'pending'
  );

create policy "Participants can remove requests or friendships"
  on public.friend_requests for delete to authenticated
  using (
    (status = 'pending' and requester_id = auth.uid())
    or (status = 'accepted' and (requester_id = auth.uid() or recipient_id = auth.uid()))
  );

create or replace function public.respond_to_friend_request(
  p_request_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to respond to friend requests.';
  end if;

  update public.friend_requests
  set status = case when p_accept then 'accepted' else 'declined' end
  where id = p_request_id
    and recipient_id = auth.uid()
    and status = 'pending';

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'This friend request is no longer available.';
  end if;
end;
$$;

revoke all on function public.respond_to_friend_request(uuid, boolean) from public;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;

-- ============================================================
-- STORAGE: Cover images bucket
-- ============================================================
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('draft-covers', 'draft-covers', false)
on conflict (id) do update set public = false;

drop policy if exists "Anyone can read cover images" on storage.objects;
drop policy if exists "Signed in users can upload cover images" on storage.objects;
drop policy if exists "Users can update their cover images" on storage.objects;
drop policy if exists "Users can delete their cover images" on storage.objects;
drop policy if exists "Authors can read their draft covers" on storage.objects;
drop policy if exists "Authors can upload their draft covers" on storage.objects;
drop policy if exists "Authors can update their draft covers" on storage.objects;
drop policy if exists "Authors can delete their draft covers" on storage.objects;

create policy "Anyone can read cover images" on storage.objects for select using (bucket_id = 'covers');
create policy "Signed in users can upload cover images" on storage.objects for insert to authenticated with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can update their cover images" on storage.objects for update to authenticated using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete their cover images" on storage.objects for delete to authenticated using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Authors can read their draft covers" on storage.objects for select to authenticated using (bucket_id = 'draft-covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Authors can upload their draft covers" on storage.objects for insert to authenticated with check (bucket_id = 'draft-covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Authors can update their draft covers" on storage.objects for update to authenticated using (bucket_id = 'draft-covers' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Authors can delete their draft covers" on storage.objects for delete to authenticated using (bucket_id = 'draft-covers' and (storage.foldername(name))[1] = auth.uid()::text);