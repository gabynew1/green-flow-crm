# Facturi & Încasări

Adaug un sistem simplu de facturare care arată providerului cât are de încasat / restant / încasat luna curentă, și clientului ce are de plătit, restanțe, următoarea plată și istoric.

## Model de date (schema)

Două tabele noi (multi-tenant, cu RLS scoped pe `tenant_id` + `customer_id` pentru client):

**`invoices`**
- `contract_id`, `customer_id`, `property_id`, `tenant_id`
- `period_start`, `period_end` (luna acoperită, sau range pentru ad-hoc)
- `issue_date`, `due_date`
- `subtotal`, `total`, `currency`
- `status`: `DRAFT` | `ISSUED` | `PAID` | `OVERDUE` | `CANCELED`
- `paid_at`, `notes`, `invoice_number` (auto-incremental per tenant)
- `source`: `CONTRACT_CYCLE` | `ADHOC` | `MANUAL`

**`invoice_line_items`**
- `invoice_id`, `contract_line_item_id?`, `service_order_id?`, `service_order_item_id?`
- `description`, `quantity`, `unit_price`, `line_total`

**`invoice_payments`**
- `invoice_id`, `amount`, `paid_at`, `method` (cash/transfer/card/other), `reference`, `recorded_by_user_id`

Statusul factură se derivează automat: `PAID` când sum(plăți) >= total; `OVERDUE` când `due_date < today` și nu e plătită complet.

## Generare hibridă

- **Job zilnic** (extindere `lifecycle-cron`) pre-generează facturi `DRAFT` pentru fiecare ciclu de contract activ ce începe în următoarele 7 zile (MONTHLY/YEARLY), cu liniile din `contract_line_items` (skip fixed-fee items când e cazul, conform logicii existente).
- **Vizite ad-hoc COMPLETED** cu items ad-hoc devin candidate pentru linii separate — atașate la factura DRAFT curentă a contractului, sau într-una nouă dacă nu există.
- Providerul poate edita liniile / suma / due_date cât e `DRAFT`, apoi apasă **Emite** → status `ISSUED` → clientul vede factura.
- Buton **Marchează încasat** înregistrează un `invoice_payments` la total și trece factura pe `PAID`.

## UI provider

Rută nouă `/provider/billing` + tab „Facturi" în `CustomerDetail` și `ContractDetail`.

Pagina `/provider/billing`:
- **4 KPI cards**: Încasat luna asta · De încasat luna asta (issued nepaid, due în luna) · Restanțe (overdue total) · În pregătire (DRAFT).
- **Tabel facturi** cu filtre: status, client, perioadă. Coloane: nr, client, contract, sumă, due_date, status, acțiuni (Vezi / Emite / Marchează încasat / Descarcă PDF-later).
- Buton „Marchează încasat" inline (checkbox) în listă.

## UI client

Rută nouă `/client/billing`:
- Card **De plătit acum** (facturi ISSUED, sortate după due_date, cu buton „Am plătit" opțional în viitor — deocamdată read-only).
- Card **Restanțe** (OVERDUE, roșu, cu zile întârziere).
- Card **Următoarea plată** (preview): următorul ciclu al fiecărui contract activ + orice serviciu ad-hoc COMPLETED neafacturat încă.
- Secțiune **Istoric plăți** (PAID, ordine descrescătoare cu data plății).

Link în navigația clientului + badge cu numărul de restanțe.

## Detalii tehnice

- Funcție DB `fn_generate_invoice_for_contract_cycle(contract_id, period_start)` — idempotentă (unique pe `contract_id + period_start`).
- Funcție DB `fn_recompute_invoice_status(invoice_id)` — chemată din trigger pe `invoice_payments`.
- View `v_client_upcoming_charges` — combină facturi ISSUED + preview următorul ciclu + ad-hoc COMPLETED neafacturat, filtrat pe `customer_id`.
- RLS:
  - Provider: `tenant_id = get_user_tenant_id()`.
  - Client: `customer_id = (SELECT customer_id FROM profiles WHERE user_id = auth.uid())`, doar pentru facturi cu status ≠ `DRAFT`.
- Numerotare: `invoice_number` generat de trigger, format `INV-{YYYY}-{seq}` per tenant.
- Currency: preluat din `tenants.currency` (deja folosit).

## Ce NU intră în acest plan

- Plăți online (Stripe/card) — doar bifă manuală provider.
- Generare PDF factură (placeholder buton, follow-up).
- Notificări email pe emitere / overdue (pot fi adăugate ulterior prin cozile existente Resend).
- Compliance RO_CIUS / e-Factura XML (există deja context separat — nu îl atingem acum).

## Livrare

1. Migrație: tabele + RLS + GRANTs + funcții + trigger + view + numărare.
2. Extindere `lifecycle-cron` pentru pre-generare DRAFT.
3. Pagină `/provider/billing` + tab în CustomerDetail/ContractDetail + acțiuni.
4. Pagină `/client/billing` + link în nav client + badge restanțe.
