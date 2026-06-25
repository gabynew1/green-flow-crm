
## Goal
Transform the landing page into a high-converting RO-first sales page built around the attached growth-marketer brief. Drive free account signups from Romanian landscaping business owners.

## Scope
Frontend-only. Update copy in `src/i18n/locales/ro/public.json` (and EN mirror for fallback parity), add 3 new sections to `src/pages/LandingPage.tsx`, and refresh existing section copy keys. No backend, no auth, no pricing logic changes.

## Sections to ship (in order)

1. **Navbar** — unchanged structurally. Update RO labels; add Pricing link.
2. **Hero** (rewrite copy only)
   - H1 (locked, verbatim): *"Aplicația de gestiune creată special pentru firmele de amenajări spații verzi și grădinărit"*
   - H2: pain → solution (echipe haotice, oferte lente, clienți pierduți → totul într-o aplicație simplă pe telefon).
   - CTA button: *"Începe gratuit – Fără card"*
   - Micro-copy: *"Configurare în 2 minute. Nu necesită cunoștințe tehnice."*
3. **NEW — Problem / Agitation** (`#problem`)
   - "O zi din viața unui patron de firmă de amenajări" — 4 bullet pains: WhatsApp haos, ploaie peste planificare, mentenanță uitată, devize în Excel duminica.
4. **Features → Benefits** (rewrite existing 6 feature cards using JTBD translation)
   - Scheduling → "Adaptează-te instant la vreme"
   - Devize/Quoting → "Închide vânzarea pe loc"
   - e-Factura → "Termină cu bătăile de cap cu ANAF"
   - Istoric client & mobil → "Biroul tău, în buzunar"
   - Echipe în teren → "Echipele văd doar programul lor zilnic"
   - Dashboard → "Vezi toate lucrările și încasările dintr-o privire"
5. **How it works** — keep 3 steps, retune RO copy.
6. **Testimonials** — rewrite as RO mock testimonials: patron firmă mică de grădinărit + antreprenor mare amenajări + voce echipă teren. Add objection-handling line: "Dacă știi să folosești WhatsApp, știi să folosești GreenGrass."
7. **NEW — Pricing / Free Forever** (`#pricing`)
   - One-message section, not a tier comparison.
   - Headline: *"Începe gratuit. Rămâi gratuit pentru totdeauna."*
   - Sub: accesul și utilizarea de bază sunt gratuite — fără card, fără perioadă de probă care expiră, fără surprize.
   - 3-4 bullet reassurance: "Fără card de credit", "Fără limită de timp", "Toate funcțiile esențiale incluse", "Plătești doar când vrei opțiuni avansate" (sau echivalent — copy only).
   - Single CTA opens the existing Start Free dialog.
8. **NEW — Final CTA** (`#final-cta`)
   - Headline: *"Oprește haosul din firmă. Creează cont gratuit."*
   - Sub: time-saved promise ("Economisește 6+ ore pe săptămână").
   - Single big coral button → Start Free dialog.
9. **Footer** — light refresh; add RO trust line (e-Factura ready, RON, suport în română).

## Implementation steps

1. Read full `LandingPage.tsx` (remaining lines) and existing `ro/public.json` + `en/public.json` to inventory current keys.
2. Update `public.json` (RO + EN) under `landing.*`:
   - Replace `hero`, `features.items.*`, `how.steps.*`, `testimonials.items.*`, `nav.*`, `startFreeDialog.*` strings with brief-aligned copy.
   - Add new namespaces: `landing.problem.*`, `landing.pricing.*` (free-forever messaging, not tiers), `landing.finalCta.*`, `landing.footer.*`.
3. Edit `LandingPage.tsx`:
   - Insert Problem section after Hero (before Social Proof).
   - Insert Pricing (Free Forever) section after Testimonials.
   - Insert Final CTA section before footer.
   - Add `#problem` and `#pricing` to `navItems` so navbar links scroll to them.
   - Pricing and Final CTA buttons call `setStartFreeOpen(true)`.
4. Keep design tokens (landing-coral, landing-mint, etc.), hand-drawn doodles, and existing motion. No new dependencies.
5. Verify build + visual check on desktop and mobile widths via Playwright screenshot.

## Out of scope
- Real Stripe/Paddle integration (free-forever messaging, no paid tiers shown).
- SEO meta rewrite (separate task if requested).
- Backend, RLS, schema, or auth changes.
- English copywriting parity beyond keeping fallback strings sensible.

## Risks / notes
- RO is default locale; EN strings stay as fallback only — won't be marketing-grade.
- Locked H1 is long — typography needs to hold on mobile (will tune `text-3xl sm:text-5xl`).
- "500+ firme" social proof line: keep as-is or soften to "zeci de firme" — confirm during build if you want it changed.
