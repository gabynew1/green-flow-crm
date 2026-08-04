# Fix "Could not load email alerts"

## What's wrong
The alerts check on `/admin/emails` crashes before returning anything, so the banner shows the raw database error `operator does not exist: timestamp with time zone - integer`.

Confirmed cause: inside the `admin_email_alerts` function, the "queue not draining" check subtracts a queue age already expressed in **seconds** from the current **timestamp**:

```text
EXTRACT(EPOCH FROM (now() - MIN(oldest_msg_age_sec)))::int
```

`oldest_msg_age_sec` is an integer number of seconds, not a timestamp, so Postgres has no valid operator and aborts the whole function. Every other alert (credentials, rate limit, DLQ, failure rate, cron) is fine but never gets returned because the error kills the call.

## The fix
One migration that replaces `admin_email_alerts` with the age calculation corrected:

- Use `MAX(oldest_msg_age_sec)::int` directly as the pending age in seconds (max = oldest message across the two queues; the old `MIN` also picked the wrong end).
- Keep the >600s threshold and the existing message wording.
- No other logic, permissions, or signature changes — the function stays super-admin-guarded with the same `SECURITY DEFINER` and search_path settings.

## Verification
After the migration, call the function and confirm it returns an alerts payload instead of an error, then reload `/admin/emails` and confirm the red "Could not load email alerts" banner is gone.
