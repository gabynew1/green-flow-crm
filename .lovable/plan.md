
# Multi-language support (RO + EN now, EU-ready)

## Goal
Ship the app in **Romanian and English** with a visible language switcher. Each user (client or tenant member) picks their preferred language at signup and can change it from Settings. Preference is persisted per user and remembered across sessions and devices.

## Approach
Use **react-i18next** (Vite/React standard, lazy namespaces, ICU plurals, RTL-ready). Split content into two layers:

1. **UI strings** (buttons, labels, nav, toasts, validation, enum badges) → JSON files in the repo.
2. **Catalog data** (55 services, 11 inventory categories, transactional email copy) → translation rows in the database, joined by locale.

Adding French/German/Italian/Spanish later = drop a new JSON folder + insert translation rows. No code changes.

## Language resolution (per request)
Priority order:
1. `profiles.locale` (signed-in users) — source of truth.
2. `localStorage('locale')` — for anonymous visitors and instant boot before profile loads.
3. Browser `navigator.language` — first visit only.
4. Fallback: **English** (neutral fallback so missing RO keys never render blank).

There is **no hardcoded default language**. The user always chooses.

## User-facing surfaces

### Language switcher widget
- Globe icon in top bar of every layout (`ProviderLayout`, `ClientLayout`, `AdminLayout`, `LandingPage`, `Auth`).
- Dropdown with the supported locales (flag + native name: "Română", "English").
- On change: writes to `profiles.locale` if signed in, always writes to `localStorage`, calls `i18n.changeLanguage`, updates `<html lang>`. No reload.

### Signup / onboarding
- `Auth.tsx` and `/onboard` wizard get a language selector at the top.
- Selection is captured into the new account's `profiles.locale` on creation.
- Provider invite acceptance and client connection flows inherit the inviter's locale as the default suggestion, still overridable.

### Settings
- New "Language & Region" card in `src/pages/provider/Settings.tsx` and `src/pages/client/ClientProfile.tsx`.
- Same selector, persists to `profiles.locale`.

## Translated scope (Phase A)
- Nav, layouts, auth pages, dashboards (provider + client + admin), common dialogs, toasts.
- All status/enum badges (SCHEDULED, COMPLETED, ACTIVE, DRAFT, etc.) via `enums.json`.
- Validation messages (Zod resolvers).
- Service catalog (55 services) — RO + EN seeded.
- Inventory categories (TREE, LAWN, …) — RO + EN seeded.
- Currency/date formatting wired to active locale (RO uses `ro-RO`, comma decimal; EN uses `en-US`).
- Pluralization via i18next (RO has its own rule set).
- `<html lang>` and `hreflang` tags on landing page.

## Phase B (follow-up, not this iteration)
- Localize the 7 transactional email templates (`supabase/functions/_shared/transactional-email-templates/*`); recipient locale read from their `profiles.locale` when queuing.
- Translate deep admin/reporting pages.
- Add a 3rd locale as smoke test (e.g. FR) to prove extensibility.
- Optional SuperAdmin UI to edit catalog translations in-app (today: managed via migrations).

## Non-goals
- No auto-translation of user-authored free text (customer names, notes, contract bodies, feedback).
- No runtime AI translation.
- No per-tenant override of supported languages (global list).

---

## Technical section

### New / changed files
- **New**: `src/i18n/index.ts`, `src/i18n/locales/{ro,en}/{common,auth,provider,client,admin,validation,enums}.json`, `src/components/LanguageSwitcher.tsx`, `src/hooks/useCatalogTranslation.ts`, `src/hooks/useLocale.ts`.
- **Migration**:
  - `ALTER TABLE profiles ADD COLUMN locale text` (nullable, no default — forces explicit choice).
  - `CREATE TABLE service_catalog_translations(service_id, locale, name, description)` + GRANT + RLS (public read, SuperAdmin write).
  - `CREATE TABLE inventory_category_translations(category_code, locale, label, description)` + GRANT + RLS (public read, SuperAdmin write).
  - Seed RO + EN rows for all services and categories.
- **Edited**: `src/main.tsx` (i18n bootstrap), `index.html` (reactive `lang`), all three layouts, `Auth.tsx`, `AdminOnboard.tsx`/onboard wizard, `Settings.tsx`, `ClientProfile.tsx`, badge/enum renderers, `InventoryTab.tsx`, `ServiceCatalog.tsx`, `formatCurrency` consumers.
- `useLocale()` hook centralizes read/write so all surfaces stay in sync.

### Dependencies
`i18next`, `react-i18next`, `i18next-browser-languagedetector`.

### Persistence flow
```text
Signup form ──► profiles.locale (insert)
                     │
Settings ────────────┤
                     ▼
Sign in ──► useLocale() reads profiles.locale ──► i18n.changeLanguage
                     │
                     └──► mirror to localStorage (offline / pre-auth boot)
```

## Open question
Are RO + EN enough for this iteration, or do you want a 3rd language (e.g. FR or DE) seeded now to validate the extensibility end-to-end?
