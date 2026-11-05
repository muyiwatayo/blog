create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  pair_low uuid generated always as (least(requester_id, recipient_id)) stored,
  pair_high uuid generated always as (greatest(requester_id, recipient_id)) stored,
  check (requester_id <> recipient_id)
);

create unique index if not exists message_threads_one_active_pair
  on public.message_threads (pair_low, pair_high)
  where status in ('pending', 'accepted');
create index if not exists message_threads_requester_updated
  on public.message_threads (requester_id, updated_at desc);
create index if not exists message_threads_recipient_updated
  on public.message_threads (recipient_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '',
  attachment_path text,
  created_at timestamptz not null default now(),
  check (length(body) <= 5000),
  check (length(btrim(body)) > 0 or attachment_path is not null),
  check (
    attachment_path is null
    or attachment_path like thread_id::text || '/' || sender_id::text || '/%'
  )
);

alter table public.messages
  add column if not exists is_request_message boolean not null default false;

create index if not exists messages_thread_created
  on public.messages (thread_id, created_at desc);
create unique index if not exists messages_one_request_opening
  on public.messages (thread_id)
  where is_request_message;

alter table public.message_threads enable row level security;
alter table public.messages enable row level security;

revoke all on public.message_threads from public, anon, authenticated;
revoke all on public.messages from public, anon, authenticated;
grant select, insert, delete on public.message_threads to authenticated;
grant select, insert on public.messages to authenticated;

drop policy if exists "Participants can read message threads" on public.message_threads;
drop policy if exists "Writers can request messages" on public.message_threads;
drop policy if exists "Requesters can remove empty requests" on public.message_threads;
drop policy if exists "Participants can read messages" on public.messages;
drop policy if exists "Participants can send allowed messages" on public.messages;

create policy "Participants can read message threads"
  on public.message_threads for select to authenticated
  using (
    auth.uid() = requester_id
    or auth.uid() = recipient_id
  );

create policy "Writers can request messages"
  on public.message_threads for insert to authenticated
  with check (
    auth.uid() = requester_id
    and requester_id <> recipient_id
    and status = 'pending'
  );

create policy "Requesters can remove empty requests"
  on public.message_threads for delete to authenticated
  using (
    requester_id = auth.uid()
    and status = 'pending'
    and not exists (
      select 1 from public.messages m where m.thread_id = message_threads.id
    )
  );

create policy "Participants can read messages"
  on public.messages for select to authenticated
  using (
    exists (
      select 1
      from public.message_threads t
      where t.id = thread_id
        and t.status in ('pending', 'accepted')
        and auth.uid() in (t.requester_id, t.recipient_id)
    )
  );

create policy "Participants can send allowed messages"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1
      from public.message_threads t
      where t.id = thread_id
        and auth.uid() in (t.requester_id, t.recipient_id)
        and (
          t.status = 'accepted'
          or (
            t.status = 'pending'
            and t.requester_id = auth.uid()
            and not exists (
              select 1 from public.messages prior
              where prior.thread_id = t.id
            )
          )
        )
    )
  );

create or replace function public.validate_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread_status text;
  thread_requester uuid;
  thread_recipient uuid;
begin
  select t.status, t.requester_id, t.recipient_id
  into thread_status, thread_requester, thread_recipient
  from public.message_threads t
  where t.id = new.thread_id
  for update;

  if not found then
    raise exception 'This conversation is no longer available.';
  end if;

  if thread_status = 'pending' then
    if new.sender_id <> thread_requester then
      raise exception 'Only the writer who started this request can send its introduction.';
    end if;
    new.is_request_message := true;
  elsif thread_status = 'accepted' then
    if new.sender_id not in (thread_requester, thread_recipient) then
      raise exception 'You are not a participant in this conversation.';
    end if;
    new.is_request_message := false;
  else
    raise exception 'This conversation is closed.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_message_insert on public.messages;
create trigger validate_message_insert
before insert on public.messages
for each row execute function public.validate_message_insert();

create or replace function public.respond_to_message_request(
  p_thread_id uuid,
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
    raise exception 'Sign in to respond to message requests.';
  end if;

  update public.message_threads
  set status = case when p_accept then 'accepted' else 'declined' end,
      updated_at = now()
  where id = p_thread_id
    and recipient_id = auth.uid()
    and status = 'pending';

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'This message request is no longer available.';
  end if;
end;
$$;

revoke all on function public.respond_to_message_request(uuid, boolean) from public;
grant execute on function public.respond_to_message_request(uuid, boolean) to authenticated;

create or replace function public.touch_message_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.message_threads
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists touch_message_thread on public.messages;
create trigger touch_message_thread
after insert on public.messages
for each row execute function public.touch_message_thread();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-images',
  'message-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Participants can read message images" on storage.objects;
drop policy if exists "Participants can upload message images" on storage.objects;
drop policy if exists "Senders can delete their message images" on storage.objects;

create policy "Participants can read message images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-images'
    and exists (
      select 1
      from public.message_threads t
      where t.id::text = (storage.foldername(name))[1]
        and t.status in ('pending', 'accepted')
        and auth.uid() in (t.requester_id, t.recipient_id)
    )
  );

create policy "Participants can upload message images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-images'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1
      from public.message_threads t
      where t.id::text = (storage.foldername(name))[1]
        and auth.uid() in (t.requester_id, t.recipient_id)
        and (
          t.status = 'accepted'
          or (
            t.status = 'pending'
            and t.requester_id = auth.uid()
            and not exists (
              select 1 from public.messages prior
              where prior.thread_id = t.id
            )
          )
        )
    )
  );

create policy "Senders can delete their message images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'message-images'
    and (storage.foldername(name))[2] = auth.uid()::text
    and exists (
      select 1
      from public.message_threads t
      where t.id::text = (storage.foldername(name))[1]
        and auth.uid() in (t.requester_id, t.recipient_id)
    )
  );
