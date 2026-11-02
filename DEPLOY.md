# Fieldnotes

Fieldnotes is a Next.js App Router application with TypeScript, React, and
Supabase for authentication, posts, writer profiles, friend requests, subscriptions,
and public cover-image storage.

## Run locally

Requirements: Node.js 20.9 or later and npm.

1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to your
   Supabase project URL and publishable key. These browser-safe values are
   required for account, publishing, and library features.
3. Run `npm install`, then `npm run dev`.
4. Open `http://localhost:3000`.

Run `npm run typecheck`, `npm run lint`, and `npm run build` before deploying.
Deploy to Vercel using the Next.js framework preset and add both
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the project
environment.

Run `supabase-schema.sql` in the Supabase SQL editor to configure the tables,
row-level security policies, and image buckets. Published covers use the public
`covers` bucket; draft covers remain in the private `draft-covers` bucket until
the author publishes them. Update the deployed
domain under Supabase **Authentication → URL Configuration** and allow it in
your Google OAuth redirect configuration.

The schema provisions mutual friend requests. Signed-in writers can discover
public profiles, send and respond to requests, and remove friendships. Published
notes remain public on writer pages; friendships do not hide or unlock posts.
Existing `follows` data is left untouched for compatibility but is no longer
used by the app.

## Install Fieldnotes

The site includes a web app manifest, PNG home-screen icons, an offline page, and a
service worker. Deploy it over HTTPS, then open the header menu and choose
**Install Fieldnotes**.
On iPhone or iPad, open Fieldnotes in Safari, tap **Share**, then **Add to Home
Screen**. The install control also shows these steps when the browser does not
offer a native install prompt. The offline page is available after the app shell
has been visited once; writing and account actions still require a connection.

## Monthly subscriber digest

Run `supabase-schema.sql` before deploying these functions. The monthly digest
collects published notes from the previous calendar month and sends one email
to each active subscriber on the first of the month at 09:00 UTC. If there are
no published notes, it skips that month's email. Publishing a note does not
send an email. Failed deliveries are recorded so a retry only resends to
subscribers who have not received that digest.

```bash
supabase login
supabase link --project-ref tyicduuijghugeztrmmj
supabase functions deploy send-monthly-digest --no-verify-jwt
supabase functions deploy unsubscribe-monthly-digest --no-verify-jwt
supabase secrets set MONTHLY_DIGEST_CRON_SECRET=replace-with-the-same-long-random-token RESEND_API_KEY=re_xxx RESEND_FROM_EMAIL="Fieldnotes <hello@your-verified-domain.com>" SITE_URL=https://your-domain.com
```

In the Supabase SQL editor, run `supabase-monthly-newsletter.sql` once. Replace
`YOUR_PROJECT_REF` with the project's ref and set
`REPLACE_WITH_A_LONG_RANDOM_SECRET` to the same token used for
`MONTHLY_DIGEST_CRON_SECRET` above. The SQL stores both the project URL and the
cron token in Supabase Vault; keep this token private.

The unsubscribe link in each digest updates the subscriber's preference without
requiring an account. Do not deploy the old `notify-new-post` function for this
monthly-only setup.

Never put `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, or the cron token in
`.env.local` or a `NEXT_PUBLIC_` variable. Supabase supplies the service-role
key to the Edge Functions automatically.
