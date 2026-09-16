# Fieldnotes deployment

## Frontend

Deploy this plain HTML/CSS/JavaScript project to Vercel, Netlify, or another static host.

- Framework preset: `Other`
- Build command: leave empty
- Output directory: leave empty
- The Supabase publishable configuration is in `src/config.js`.

## Subscriber notifications

The browser stores subscriber emails in Supabase. The Supabase Edge Function `notify-new-post` reads them with the service role key and sends mail through Resend after a signed-in user publishes.

```bash
supabase login
supabase link --project-ref tyicduuijghugeztrmmj
supabase functions deploy notify-new-post
supabase secrets set RESEND_API_KEY=re_xxx RESEND_FROM_EMAIL="Fieldnotes <hello@your-verified-domain.com>" SITE_URL=https://your-domain.com
```

Use a verified sending domain in Resend. Never put `SUPABASE_SERVICE_ROLE_KEY` or `RESEND_API_KEY` in the React `.env` file. Supabase provides its service role key to the Edge Function automatically.

After deployment, set the deployed domain in Supabase **Authentication → URL Configuration** and add it to the Google OAuth redirect settings as needed.