## Goal

Close the biggest gap in the new Visit Requests flow: providers currently have no signal when a client submits a request, and once a request is converted there's no back-link to the actual visit. This plan adds notifications, a live pending-count badge, and a bidirectional link between `visit_requests` and `service_orders`.

## Scope

**In scope**
1. Notify provider admins when a client submits a new visit request (in-app + email).
2. Show a live pending count on the sidebar "Visit Requests" item.
3. Link a converted request to the visit it produced, and surface that link on both sides.
4. Small client-side confirmation copy improvement showing the request was received.

**Out of scope (queued for later)**
- Retiring legacy visit-status enum values.
- Extending reschedule conflict detail / zone-awareness.
- Auto-decline of stale requests.
- i18n of the Visit Requests page strings.

## What changes

### 1. Notifications on new request
- Add a DB trigger `visit_requests_after_insert` that:
  - Inserts a `user_notifications` row for every `PROVIDER_ADMIN` / `full_admin` in the request's tenant, with a link to `/provider/visit-requests`.
  - Emits an email via the existing Resend queue using a new `visit-request-created` template (RO default, EN fallback), respecting `user_email_preferences`.
- Reuse existing helpers — do not add new email tooling.

### 2. Sidebar pending badge
- Add a lightweight tenant-scoped query hook `usePendingVisitRequestCount()` that subscribes to `visit_requests` realtime `INSERT`/`UPDATE` and counts `status = 'pending'`.
- Render the count as a badge next to the "Visit Requests" nav item in `ProviderSidebar.tsx`, matching the existing notification badge styling.

### 3. Convert → link back
- Add `service_order_id uuid null` on `visit_requests` (FK → `service_orders(id)` on delete set null).
- Update `CreateAdHocVisitDialog` to accept an optional `onCreated(visitId)` callback that returns the new visit id.
- In `VisitRequests.tsx`, when a request is converted, store the returned `service_order_id` alongside setting `status = 'converted'`.
- Show a "Converted → View visit" link on converted rows.
- On the provider `VisitDetail.tsx`, when the visit came from a request, show a "Created from client request" pill linking back to the request.

### 4. Client-side copy
- After `ClientFeedback.tsx` submits, keep the current toast, and additionally add a small "Recent requests" list on the client dashboard showing status (pending/converted/declined) so clients aren't left wondering.

## Technical notes

**Migration outline**
```sql
alter table public.visit_requests
  add column service_order_id uuid null references public.service_orders(id) on delete set null;

create index visit_requests_service_order_id_idx on public.visit_requests(service_order_id);

create or replace function public.fn_notify_new_visit_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_notifications (user_id, tenant_id, kind, title, body, link, created_at)
  select ur.user_id, new.tenant_id, 'visit_request_new',
         'New visit request',
         'A client submitted a new visit request.',
         '/provider/visit-requests',
         now()
  from public.user_roles ur
  where ur.tenant_id = new.tenant_id
    and ur.role in ('PROVIDER_ADMIN','full_admin');

  -- enqueue email via existing email_send_state / process-email-queue path
  perform public.enqueue_transactional_email(
    'visit-request-created',
    new.tenant_id,
    jsonb_build_object('visit_request_id', new.id)
  );
  return new;
end $$;

create trigger visit_requests_after_insert
after insert on public.visit_requests
for each row execute function public.fn_notify_new_visit_request();
```
(Exact column names for `user_notifications` and the email-enqueue helper will be confirmed by reading the current schema before writing the migration; the trigger will match whatever helpers already exist.)

**Frontend touch list**
- `src/components/provider/ProviderSidebar.tsx` — badge on Inbox item.
- `src/hooks/usePendingVisitRequestCount.ts` — new hook (realtime).
- `src/pages/provider/VisitRequests.tsx` — persist `service_order_id`, render "View visit" link on converted rows.
- `src/components/provider/CreateAdHocVisitDialog.tsx` — `onCreated` returns the created id.
- `src/pages/provider/VisitDetail.tsx` — "Created from client request" pill when a matching `visit_requests` row exists.
- `src/pages/client/ClientDashboard.tsx` (or the client home) — recent requests panel.
- `supabase/functions/_shared/email-templates/visit-request-created/` — new RO/EN template.

## Verification

1. As a client, submit a request → expect a toast, a new row in `visit_requests`, a `user_notifications` row for each provider admin, and one queued email in `email_send_state`.
2. Sidebar badge reflects the new pending count without a manual refresh (realtime).
3. Convert the request → `visit_requests.status = 'converted'`, `service_order_id` populated, "View visit" link works both ways.
4. Decline the request → no visit created, status becomes `declined`, badge decrements.
5. Client dashboard shows the request with its updated status.
