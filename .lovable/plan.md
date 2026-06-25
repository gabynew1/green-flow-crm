ns
# Lovable features worth adopting for GreenGrassCRM

Below is a curated list of Lovable platform capabilities that would meaningfully benefit this project, grouped by impact. Nothing is implemented yet — pick which ones to turn into actual work items.

## 1. Growth & SEO (high ROI, low effort)
- **SEO Review agent** — automated scan that flags missing meta, OG, canonical, JSON-LD, robots, sitemap, alt text, H1 issues. We already have a landing page rewrite; this catches regressions.
- **Per-route head metadata** via `react-helmet-async` — today only `index.html` has tags. Add unique `<title>`, description, canonical, OG per public route (`/`, `/pricing`, `/onboard`, `/auth`, future blog).
- **Sitemap generator** (`scripts/generate-sitemap.ts` + `predev`/`prebuild`) — currently no dynamic sitemap. Helps Google index public pages.
- **robots.txt hardening** — ensure `/admin`, `/provider`, `/client`, `/onboard` internals not indexed.
- **Semrush integration** — keyword research for RO landscaping market ("firmă întreținere spații verzi", "CRM peisagistică"), competitor gap analysis, ongoing rank tracking dashboard inside the app.
- **OG image generation** for landing + pricing using imagegen (Romanian-language social cards).

## 2. Security & Compliance (matches project's tenant-isolation mandate)
- **Security Scanner** — automated RLS / policy / grant / secret-leak findings. Run on a schedule; we already use it ad-hoc.
- **Security memory** — encode our tenant-isolation rules (RLS required, GRANTs, no roles on profiles, super_admin table check) so future scans don't false-positive.
- **Dependency scan** (`code--dependency_scan`) — surface vulnerable npm packages.
- **Secrets manager** — migrate any hardcoded keys/URLs to `secrets--add_secret` (Resend, Google OAuth client secret, etc.).
- **Rotate API keys** workflow documented for incident response.

## 3. Lovable AI Gateway (replace/augment current AI usage)
- Already using Gemini-1.5-Flash for the assistant. Gateway gives:
  - **No API key management** + usage caps per-tenant.
  - **Embeddings** → semantic search across contracts, visits, properties (e.g., "find all properties with irrigation issues last summer").
  - **Vision** → photo intake for visit before/after pictures with auto-tagging.
  - **TTS / STT** → field staff dictate visit notes from mobile.
  - **Image gen** → property cover images, service-catalog illustrations in RO.

## 4. Lovable Cloud upgrades we haven't fully used
- **Edge function scheduled jobs / cron** — already using `pg_cron` for email queue + lifecycle. Audit for: contract renewal reminders, overdue invoice nudges, weekly digest emails to PROVIDER_ADMINs.
- **Realtime** — live updates on Visits calendar when team members complete jobs in the field (currently requires refresh).
- **Storage buckets** — structured bucket policy review for property photos, contract PDFs, invoice attachments, e-Factura XMLs.
- **Analytics tool** (`analytics--read_project_analytics`) — track which features tenants actually use to inform roadmap.

## 5. Connectors & Integrations
- **Standard connectors** browser — check for native integrations replacing custom code:
  - Google Calendar (we built custom OAuth — connector may be simpler).
  - Gmail (same).
  - Stripe / Paddle for paid plans once we move past Free Forever.
  - Shopify (not relevant unless you sell merch).
- **MCP knowledge** — expose RO bank holiday calendar, e-Factura schema, service catalog as MCP for the AI assistant.

## 6. Email infrastructure (already on Resend)
- **Custom domain status check** for `send.greengrasscrm.ro` (DKIM/SPF/DMARC health).
- **Transactional template scaffolding** — we have 7 triggers; review for: welcome, password-reset polish, monthly statement, contract-expiry T-30/T-7, invoice-overdue T+7/T+14.
- Note: project memory forbids Lovable Email tooling — stay on Resend.

## 7. Publishing & Deployment polish
- **Custom domain** — already on `greengrasscrm.ro`. Confirm `www` → apex redirect and HTTPS.
- **Hide "Edit with Lovable" badge** (Pro plan) for a more professional public site.
- **Share-preview links** for prospects to demo without login (7-day public previews).
- **Publish visibility settings** — confirm workspace-only vs public for staging.

## 8. Performance & UX
- **Preview device viewport** testing for mobile field-staff flows (visits, photo upload).
- **Larger Cloud instance** if we hit timeouts on heavy tenants (multi-property dashboards, calendar month view).
- **Slow query** + **DB health** review — index audit on `visits`, `contracts`, `inventory_items` tenant_id composite indexes.

## 9. Developer productivity
- **Skills** (`.workspace/skills/`) — codify our repeated workflows: "add a new tenant-isolated table" (table + GRANTs + RLS + types + useTenantQuery wiring), "add a new email trigger", "add a new translated screen".
- **Subagents** (`acp_subagent--spawn_agent`) — parallelize multi-file refactors (e.g., adding i18n to remaining untranslated screens).
- **Chat search** — recall earlier decisions across long history.

## 10. Monetization readiness (when ready to leave Free Forever)
- **Stripe** or **Paddle** enablement — Paddle handles EU VAT automatically (RO-friendly).
- Plan limits already modeled (`free`/`trial`/`professional`/`enterprise`); just needs gateway wiring.

---

## Suggested first batch (if you want to act on this)
1. SEO Review scan + per-route Helmet + sitemap generator (1 sprint).
2. Security scan + dependency scan + secrets audit (½ sprint).
3. Realtime on visits calendar (½ sprint).
4. Semrush keyword/competitor scan for RO market (research only).
5. Skill: "add tenant-isolated table" to prevent future GRANT/RLS misses.

Tell me which numbered items to turn into real implementation plans and I'll scope each properly.
