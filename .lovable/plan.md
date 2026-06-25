## Goal
Make the entire app Romanian by default, with a visible language widget everywhere (including public pages), and ensure remaining English-only public pages get translated.

## Current state (verified)
- i18n infrastructure exists (`src/i18n/index.ts`, `useLocale`, `LanguageSwitcher`).
- Two locales: `ro` (Română) and `en`. RO and EN translation files are at parity (141 lines each, all 7 namespaces present).
- Service catalog and inventory categories are **already fully translated in RO** in DB (`service_catalog_translations`: 162/162 rows; `inventory_category_translations`: 11/11). No DB work needed.
- `LanguageSwitcher` is already mounted in `ProviderLayout`, `ClientLayout`, `AdminLayout`, and `Auth`.
- Gaps:
  1. **Default language is English** (`FALLBACK_LOCALE = "en"`, detection prefers `navigator`).
  2. **Public marketing pages are hardcoded English** with no widget: `LandingPage.tsx` (514 lines), `Pricing.tsx`, `NotFound.tsx`, `AccountLocked.tsx`, `Verify.tsx`, `ResetPassword.tsx`, `ChangePassword.tsx`, `Unsubscribe.tsx`.

## Changes

### 1. Default language → Romanian
- `src/i18n/config.ts`: `FALLBACK_LOCALE = "ro"`.
- `src/i18n/index.ts`: keep `localStorage` first in detection order (preserves explicit user choice), but set `fallbackLng: "ro"` and add `lng: undefined` so first-time visitors with no stored choice and unsupported browser language land on RO.
- `useLocale.ts`: `current ?? "ro"`.
- Behavior:
  - Existing users with a `profiles.locale` keep their choice.
  - Existing anonymous visitors with `localStorage.locale` keep their choice.
  - New visitors → RO immediately, switchable via widget.

### 2. New `public` i18n namespace
Add `src/i18n/locales/{en,ro}/public.json` covering all strings in the 8 public pages above (hero, features, pricing tiers, CTAs, footer, 404, account-locked, email verification, password flows, unsubscribe). Register it in `src/i18n/index.ts` (`ns` array).

### 3. Translate public pages
Refactor these to use `useTranslation("public")` and pull strings from the new namespace — no visual/layout changes, only string replacement:
- `LandingPage.tsx` — nav, hero, features, testimonials, pricing teaser, CTA, footer.
- `Pricing.tsx` — tier names, features, CTAs.
- `NotFound.tsx`, `AccountLocked.tsx`, `Verify.tsx`, `ResetPassword.tsx`, `ChangePassword.tsx`, `Unsubscribe.tsx`.

### 4. Add language widget to public pages
- `LandingPage.tsx` nav (top-right, both desktop bar and mobile menu): `<LanguageSwitcher variant="icon" />`.
- `Pricing.tsx` header.
- Smaller utility pages (NotFound / AccountLocked / Verify / Reset / ChangePassword / Unsubscribe): add a discreet `LanguageSwitcher` in a top-right absolute-positioned wrapper so visitors can flip language before/after the action.

### 5. Service templates
No code or DB changes — already 100% translated in `service_catalog_translations` and surfaced via existing `useServiceCatalogTranslator`. Verify by switching locale in the widget on `/provider/services` and confirming Romanian names appear.

## Out of scope
- No changes to the provider/client/admin internal pages (already wired through i18n; any missed strings would be tracked separately).
- No new locales beyond `ro` and `en`.
- No DB migrations.

## Acceptance
- First visit on a clean browser → UI in Romanian.
- Language widget visible on landing, pricing, auth, and all utility pages.
- Switching to English on any page persists across navigation (localStorage + `profiles.locale` when signed in).
- Service catalog entries (e.g. on `/provider/services`, contract creation, offers) display Romanian names when locale = RO.
- No remaining hardcoded English on the 8 public pages listed above.
