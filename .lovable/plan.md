# "Email dispatcher cron is missing" — false alarm, make the alert smarter

## What it means today
Your email sender doesn't run on a permanent timer. It works on demand:

1. An email is queued.
2. A database trigger immediately wakes the sender and schedules a 5-second repeating job.
3. When both queues are empty, the job removes itself again.

So the absence of the job is the normal idle state, not a fault. Checked just now: both live queues are empty and the wake trigger and dispatcher are both installed and healthy. Nothing is broken and no emails are stuck — the alert is simply checking the wrong thing.

(Separately, 5 old messages sit in the transactional dead-letter queue from months ago. Not related to this alert; can be reviewed or discarded in the DLQ tab.)

## The fix
Change the alert rule so it reflects the on-demand design:

- Drop the plain "cron job does not exist" alert.
- Raise a critical alert only when there is real work stuck: messages waiting in `auth_emails` or `transactional_emails` **and** no `process-email-queue` job scheduled (or the job exists but is inactive). That is the only state where mail genuinely won't move.
- Add a low-noise critical check that the wake trigger / dispatcher function still exist, since those are what re-arm the job. If either disappears, sending really would break silently.
- Keep the existing "queue not draining" alert unchanged.

## Technical note
Single migration replacing `public.admin_email_alerts()`: replace the `cron_missing` / `cron_inactive` blocks with a combined condition gated on queue depth from `pgmq.metrics_all()`, plus an existence check on `public.email_queue_wake` / `public.email_queue_dispatch`. No UI changes needed — the banner renders whatever alerts the function returns.
