

## Plan: Admin Onboarding Wizard + Invite Email UI (skip domain setup)

### Overview

Build a Google Workspace-inspired multi-step onboarding wizard at `/admin/onboard`. The "Create New Tenant" button on Tenant Management redirects here. The wizard walks through: type selection → method selection → invite (with email template preview) or manual creation → confirmation. Email sending is stubbed (console log + toast) until domain is configured later.

### Wizard Flow (4 Steps)

**Step 1 — Choose Type**: Two large cards — "Service Provider" (Building2 icon) or "Customer" (Users icon). Clean, spacious layout.

**Step 2 — Choose Method**: Two cards — "Send Invite Link" (email-driven, self-onboarding) or "Manual Setup" (admin fills in data now).

**Step 3a — Invite Flow**:
- Fields: Recipient Name, Recipient Email, Company/Household Name
- For providers: calls `create-provider-invite` edge function to generate invite link
- For customers: generates a connect link using tenant's `unique_tenant_id`
- Shows email preview (rendered HTML template inline) with personalized name, CTA button
- "Send Invite" button (stubbed — copies link + shows toast "Email sending will be available after domain setup")
- Also shows copyable link as fallback

**Step 3b — Manual Flow**:
- Provider form: Company Name, Admin Full Name, Admin Email, Phone, CUI
- Customer form: Name, Contact Person, Email, Phone
- Calls new `create-manual-user` edge function

**Step 4 — Confirmation**: Success screen with summary, "Create Another" and "Back to Dashboard" buttons.

### Email Templates (UI Preview Only)

Two inline HTML templates rendered as preview cards in the wizard:

| Template | Subject | Personalization |
|----------|---------|-----------------|
| Provider | "You're invited to join GreenCRM" | `{recipientName}`, company context, setup CTA |
| Customer | "{providerName} invited you to connect" | `{recipientName}`, provider name, property connection CTA |

Both use the project's green theme colors. Rendered as a preview `<iframe>` or `dangerouslySetInnerHTML` card so the admin sees exactly what will be sent.

### New Files

| File | Purpose |
|------|---------|
| `src/pages/admin/AdminOnboard.tsx` | Multi-step wizard page |
| `supabase/functions/create-manual-user/index.ts` | Edge function: creates auth user + profile + role for provider or customer |

### Files to Edit

| File | Change |
|------|--------|
| `src/pages/admin/TenantManagement.tsx` | "Create New Tenant" button → `navigate("/admin/onboard")` |
| `src/App.tsx` | Add `/admin/onboard` route under admin layout |
| `supabase/config.toml` | Register `create-manual-user` function |

### Edge Function: `create-manual-user`

- Validates super admin via auth header
- Accepts `{ type: "provider" | "customer", data: { name, email, fullName, phone, cui? } }`
- **Provider path**: creates tenant → creates auth user (temp password) → creates profile (with tenant_id, company fields) → creates user_role (PROVIDER_ADMIN)
- **Customer path**: creates auth user (temp password) → creates profile → creates user_role (CLIENT_USER)
- Returns: `{ userId, email, temporaryPassword, tenantId? }`

### UI Design

- Full-width page inside AdminLayout (uses Outlet)
- Step indicator: horizontal dots/progress bar at top
- Back button on each step
- Large card selections with hover ring effect
- Smooth fade-in transitions between steps
- Email preview card with branded HTML (green gradient header, white body, CTA button)
- Mobile-responsive (single column on small screens)

