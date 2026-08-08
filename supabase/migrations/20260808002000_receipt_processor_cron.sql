-- Automatically process newly uploaded receipts once per minute.
-- The Edge Function is deployed with --no-verify-jwt and only processes receipts
-- already queued in the database, so no user data is accepted from this cron call.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'grosharey-process-receipts' limit 1;
  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;
end $$;

select cron.schedule(
  'grosharey-process-receipts',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://lhhfymukogdixptmctjc.supabase.co/functions/v1/process-receipts',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
