-- Enable these Supabase extensions first if they are not already enabled.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema "extensions";

-- Replace both values once, then store the same long random token as the
-- MONTHLY_DIGEST_CRON_SECRET Edge Function secret.
select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'fieldnotes_project_url',
  'Fieldnotes project URL for the monthly newsletter cron'
);
select vault.create_secret(
  'REPLACE_WITH_A_LONG_RANDOM_SECRET',
  'fieldnotes_monthly_digest_cron_secret',
  'Bearer token for the Fieldnotes monthly digest Edge Function'
);

-- Remove a prior schedule with this name before recreating it.
select cron.unschedule(jobid)
from cron.job
where jobname = 'fieldnotes-monthly-digest';

-- Runs at 09:00 UTC on the first day of each month.
select cron.schedule(
  'fieldnotes-monthly-digest',
  '0 9 1 * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'fieldnotes_project_url'
    ) || '/functions/v1/send-monthly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'fieldnotes_monthly_digest_cron_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
