# GreenGrassCRM

Multi-tenant SaaS CRM for landscaping and grounds-care service providers, with
a paired self-service portal for their clients. Production domain:
`https://greengrasscrm.ro`. Built and deployed on Lovable Cloud (Supabase
under the hood).

> This README is the canonical context document for human contributors **and**
> AI agents working in this repo. Keep it in sync with the actual product when
> scope changes.

---

## 1. Business declaration

- **Product**: GreenGrassCRM — operational CRM tailored to Romanian landscaping
  / grounds-maintenance companies that sell recurring service contracts.
- **Operator**: A single SaaS operator (the "platform") onboards independent
  service-provider companies ("tenants") and their end customers ("clients").
- **Users**:
  1. **Super Admin** — platform staff. Operates the whole system, manages
     tenants, audits, lifecycle, email ops. Identified by presence in the
     `super_admins` table (never by a role flag on `profiles`).
  2. **Provider** — staff of a landscaping company (a tenant). Roles inside
     a tenant: `full_admin` and `field_staff`. Hard cap of 2 seats per tenant.
  3. **Client** — the end customer of a provider. Receives a portal account
     with read-mostly access to their contracts, offers, visits, properties
     and feedback.
- **Core value loop**: Provider builds a customer + property book, runs a
  sales pipeline (inspection → offer → contract), schedules recurring service
  visits against contract scope, and bills against delivered work. Client sees
  the same data filtered to their account and approves/rejects offers,
  contracts and feedback.
- **Compliance**: Romanian e-invoicing (`RO_CIUS` / e-Factura) is mandatory
  for billing data. Workday calendar excludes Sundays and Romanian bank
  holidays by default. Multi-currency, default RON, all monetary values
  rounded up (`CEIL`) to whole units via `useTenantCurrency`.
- **Tenancy & isolation** (non-negotiable):
  - Every domain table carries `tenant_id` and is read/written through the
    `useTenantQuery` hook (proxy pattern that auto-scopes queries).
  - RLS is on for every public-schema table; policies route through
    `has_role(auth.uid(), …)` and tenant membership checks.
  - Cross-tenant data leakage is treated as a P0 bug.

---

## 2. Tech stack & infrastructure

| Layer            | Tech                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| Frontend         | React 18, Vite 5, TypeScript 5, Tailwind v3, shadcn/ui, react-router-dom v6 |
| State / data     | `@tanstack/react-query`, Supabase JS client, realtime subscriptions  |
| Backend          | Lovable Cloud = Supabase (Postgres + Auth + Storage + Edge Functions) |
| Email            | **Resend only**, queued via PGMQ + `pg_cron`, rendered with react-email |
| AI               | Lovable AI Gateway, model `gemini-1.5-flash` for the in-app assistant |
| i18n             | `i18next` with `en` and `ro` locales under `src/i18n/locales/`        |
| Testing          | Vitest (unit) + Playwright (e2e fixture in `playwright-fixture.ts`)  |

Custom domains in production: `greengrasscrm.ro`, `www.greengrasscrm.ro`.
Email sender domain: `send.greengrasscrm.ro` (do **not** reference the stale
`notify.greengrasscrm.ro`).

### Auto-generated files — do not edit

- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`
- `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`)
- `supabase/config.toml` (project-level Supabase settings)
- Anything inside `supabase/migrations/` is append-only; never modify an
  existing migration, always add a new timestamped one.

---

## 3. Application surface (route map)

Three portals are mounted by `src/App.tsx` and gated by `useAuth`:

### Super Admin portal — `/admin/*`
`AdminDashboard`, `TenantManagement`, `GlobalUserManagement`,
`AuditCompliance`, `SecurityMonitor`, `EmailOperations`, `AdminInvites`,
`AdminOnboard`, `LifecycleDashboard`.

### Provider workspace — `/provider/*`
`Dashboard`, `Customers` + `CustomerDetail` + `CustomerManage`,
`PropertyDetail`, `ServiceCatalog`, `SalesPipeline` (Kanban for inspections /
offers / contracts), `InspectionDetail`, `OfferDetail`, `ContractNew` +
`ContractDetail`, `ServiceVisits` (calendar) + `VisitDetail`, `Feedback`,
`Settings`, `AIAssistant`, shared `TasksPage`.

### Client portal — `/client/*`
`ClientDashboard`, `ClientOffers` + `ClientOfferDetail`, `ClientContracts` +
`ClientContractDetail`, `ClientPropertyDetail`, `ClientVisits` +
`ClientVisitDetail`, `ClientFeedback`, `ClientProfile`, `ClientConnect`
(GC-XXXXXX flow), `ClientProviders`, shared `TasksPage`, `ClientEmailHistory`.

### Public / shared
`LandingPage`, `Auth`, `ResetPassword`, `Unsubscribe`, `Pricing`,
`EmailWebview`, `Verify`, `AccountLocked`, `ChangePassword` (forced when
`profile.password_reset_pending`).

---

## 4. Domain model (high level)

Key Postgres tables (see `supabase/migrations/` for full schema and
`src/integrations/supabase/types.ts` for typings):

- **Identity**: `profiles` (single source of truth for contact info, synced
  into `customers` via `sync_profile_to_customer` trigger), `user_roles`
  (`app_role` enum, checked via `has_role` SECURITY DEFINER), `super_admins`,
  `tenants`, `team_members`, `teams`, `provider_invites`.
- **CRM core**: `customers`, `properties`, `client_connections`,
  `action_tasks` (+ comments/events), `tasks`, `feedback`.
- **Sales pipeline**: `inspections`, `offers` + `offer_line_items`,
  `contracts` + `contract_line_items`, `contract_closure_events`.
- **Delivery**: `service_orders` (visits) + `service_order_items`,
  `service_catalog` + translations, `inventory` + `inventory_items` +
  category translations.
- **Scheduling**: `tenant_non_workdays`, `global_holidays`.
- **Comms**: `email_send_log`, `email_send_state`, `email_categories`,
  `email_unsubscribe_tokens`, `suppressed_emails`, `user_email_preferences`,
  `tenant_email_settings`, `user_notifications`, `notification_dedupe`.
- **Lifecycle / governance**: `tenants` (status, lock fields), `trial_extensions`,
  `lifecycle_email_log(_v2)`, `lifecycle_deletion_audit`, `super_admin_audit_logs`,
  `security_alerts`, `activity_log`, `password_reset_tokens`, `integrations`.

### ID conventions

- **Client number**: `GC-XXXXXX` (used by providers to connect to a client).
- **Tenant number**: `GP-XXXXXX` (used for provider invites).
- **Property ID suffix**: `LastName_PropertyName_4CharSuffix`.

---

## 5. Edge functions (`supabase/functions/`)

- **Auth & accounts**: `accept-provider-invite`, `create-provider-invite`,
  `invite-team-member`, `create-manual-user`, `request-password-reset`,
  `confirm-password-reset`, `reset-user-password`, `auth-email-hook`.
- **Lifecycle**: `lifecycle-cron`, `lifecycle-email-drip`,
  `lifecycle-touch-login`, `tenant-decommission`, `tenant-reactivate`,
  `client-decommission`, `client-reactivate`.
- **Email**: `process-email-queue` (the only path that talks to Resend),
  `send-transactional-email`, `preview-transactional-email`,
  `render-email-webview`, `admin-email-ops`, `handle-email-suppression`,
  `handle-email-unsubscribe`.
- **AI**: `ai-assistant` (Lovable AI Gateway → Gemini 1.5 Flash, context-aware
  prompt built from the current tenant scope).

---

## 6. Core business rules (must be respected by any agent)

1. **Multi-tenancy** — never write a query that touches a tenant table without
   `tenant_id`. Use `useTenantQuery` on the client; on the server use the
   user's JWT-derived tenant and RLS.
2. **Roles** — `SuperAdmin > Provider (full_admin > field_staff) > Client`.
   Never store role flags on `profiles`. Always check via the `user_roles`
   table and the `has_role()` SECURITY DEFINER function.
3. **Visit lifecycle** — 3 stages, locked once `COMPLETED`. Contract scope
   consumption is computed from `Delivered` items inside `COMPLETED` visits.
4. **Scheduling** — capacity-aware, max 4 visits per team per day; Sundays
   and Romanian bank holidays are blocked at the global calendar level.
5. **Currency** — default RON, multi-currency aware, `CEIL` rounding to whole
   units. Use `useTenantCurrency` for display and storage.
6. **Subscriptions** — tiers: `free`, `trial`, `professional`, `enterprise`.
   Trial behaviour is owned by the lifecycle cron + `TrialBanner`.
7. **Archiving** — soft-archive via an `archived` boolean; do not hard-delete
   historical records that belong to closed contracts or completed visits.
8. **Email** — **Resend only**, exclusively through the queue + cron path.
   Forbidden tools: `email_domain--setup_email_infra`,
   `email_domain--scaffold_auth_email_templates`,
   `email_domain--scaffold_transactional_email`,
   `email_domain--toggle_project_emails`. See
   `supabase/functions/_shared/EMAIL_POLICY.md`.
9. **Romanian compliance** — billing flows must respect `RO_CIUS` /
   e-Factura validations; tax-ID validation lives in
   `src/lib/` and the contract/offer detail pages.
10. **Account lock** — when a tenant or client is locked, all non-super-admin
    routes hard-redirect to `/account-locked` (see `AppRoutes` guard).

---

## 7. Design system

- Aesthetic: Google Workspace minimal × "Fresh & Organic". Emerald green
  (`#10b981`) as the primary accent, soft rounded corners, generous spacing.
- All color, gradient and shadow values live as semantic tokens in
  `src/index.css` and are themed through `tailwind.config.ts` + shadcn
  variants. **Never hardcode** color utilities (`text-white`, `bg-black`,
  `bg-[#...]`) in components — they break dark mode and theming.
- Typography: system / Inter stack via Tailwind defaults; no serif fonts.

---

## 8. Settings & secrets

- Lovable Cloud is enabled. The Supabase service-role key and DB password are
  **not** accessible to agents or end users on Lovable Cloud — do not write
  code that depends on them and do not invent placeholder values.
- Configured connectors (managed via Lovable settings): **Resend** (email),
  **Google** OAuth2 (Gmail + Calendar via a custom flow, see
  `mem://integrations/google-services`).
- Public auth providers configured: email/password + Google. No anonymous
  sign-ups. Email auto-confirm is off.
- AI: Lovable AI Gateway (no user-supplied key needed).

---

## 9. Repository layout

```
src/
  App.tsx                  Route map + role-based gating
  pages/                   Top-level routed pages
    admin/                 Super Admin portal
    provider/              Provider workspace
    client/                Client portal
    tasks/                 Shared task views
  components/
    admin/ provider/ client/  Portal-specific components
    notifications/ auth/      Cross-cutting features
    ui/                       shadcn/ui primitives (do not rename)
  hooks/                   useAuth, useTenantQuery (via supabase-tenant),
                           useTenantCurrency, useNotifications, useWorkdays, …
  i18n/locales/{en,ro}/    Translation bundles per portal
  integrations/supabase/   AUTO-GENERATED client + types (do not edit)
  lib/                     contracts, schedule-engine, workflow-engine,
                           contract-consumption, currency, tiers,
                           send-app-email, supabase-tenant, utils
supabase/
  functions/               Edge functions (see section 5)
  migrations/              Append-only SQL migrations
  config.toml              AUTO-GENERATED (do not edit)
scripts/                   bootstrap.ts, debug_db.ts, update_catalog.ts
.lovable/plan.md           Live working plan for in-flight features
```

---

## 10. Memory / agent notes

Persistent project memory lives at `mem://` and is the highest-priority
source of truth for product rules — Core rules in `mem://index.md` are
applied to every action. Notable entries an agent should consult before
touching the matching area:

- `mem://architecture/multi-tenancy`, `mem://architecture/data-integrity`
- `mem://features/visit-workflow`, `mem://features/contract-lifecycle`,
  `mem://features/contract-scope-tracking`, `mem://features/sales-pipeline`,
  `mem://features/inspection-management`
- `mem://features/property-management`, `mem://features/inventory-system`,
  `mem://features/service-catalog`
- `mem://features/client-connection`, `mem://features/portals`,
  `mem://features/provider-team-management`,
  `mem://features/provider-invite-system`
- `mem://features/workday-management`, `mem://features/team-scheduling`,
  `mem://features/notifications`
- `mem://business-logic/currency`, `mem://business-logic/subscriptions`
- `mem://features/billing-compliance`
- `mem://infrastructure/email-setup`, `mem://integrations/google-services`
- `mem://auth/roles`, `mem://auth/security-features`,
  `mem://auth/onboarding`, `mem://auth/password-management`
- `mem://admin/system-governance`

When you change product behaviour, update both the relevant `mem://` entry
**and** this README so future agents stay in sync.

---

## 11. Local development

```sh
npm i
npm run dev      # Vite dev server with HMR
```

Builds and typechecks run automatically in the Lovable harness — do not
invoke `npm run build` / `tsc` manually from agent tooling. Use Vitest
(`bunx vitest run`) for unit tests and the Playwright fixture for e2e.
