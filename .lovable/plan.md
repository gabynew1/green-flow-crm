Switch all email sending to the already-verified Resend sender domain `send.greengrasscrm.ro`, so password resets, signup verification, magic links, and app/transactional emails actually deliver — without depending on the failed `notify.greengrasscrm.ro` Lovable-managed domain or any new NS records at datahost.ro.

## What changes

1. Update the auth email function (`auth-email-hook`)
   - Replace the stale config that points to `www.greengrass.zealot.ro` (broken).
   - New sender: `GreenGrass CRM <noreply@send.greengrasscrm.ro>`.
   - Site URL in templates updated to `https://greengrasscrm.ro`.
   - Site name updated to `GreenGrass CRM`.

2. Update the app/transactional email function (`send-transactional-email`)
   - Change `SENDER_DOMAIN` from `notify.greengrasscrm.ro` (failed) to `send.greengrasscrm.ro` (verified in Resend).
   - Keep `FROM_DOMAIN` aligned so the From header reads `noreply@send.greengrasscrm.ro`.
   - Fix a small duplicate `supabaseServiceKey` declaration found in the file.

3. Disable the Lovable-managed email pipeline
   - Turn off Lovable Emails so the platform stops trying to use the broken `notify.greengrasscrm.ro` domain.
   - Auth + app emails will keep working through our edge functions, which send via the Resend connector.
   - Custom branded auth templates remain in use through the `auth-email-hook` function.

4. Redeploy both edge functions
   - Deploy `auth-email-hook` and `send-transactional-email` so the new sender takes effect immediately.

5. Test and verify
   - Trigger a test signup verification or password reset.
   - Trigger one transactional email path.
   - Check `email_send_log` to confirm `status = sent` for both.
   - If anything fails, read edge function logs and fix.

## What does NOT change

- The email queue, retries, suppression, unsubscribe handling, and email send log all keep working as-is.
- Existing email templates and styling are preserved.
- Existing Resend connector and API key are reused — no new secrets needed.
- The `notify.greengrasscrm.ro` Lovable domain is left in place but unused; can be cleaned up later.

## Risk and rollback

- Low risk. We are switching the sender domain to one that is already verified in Resend (DKIM + SPF + MX visible in datahost DNS).
- If sending fails, rollback is simply reverting the two edge functions and re-enabling Lovable Emails.

## Confirmation needed

Approve this plan and I'll switch to build mode and apply the changes, deploy, and verify with a test send.