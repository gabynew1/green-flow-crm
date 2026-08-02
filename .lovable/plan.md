## Goal

Reports and invoices currently export with generic, repeating names (`Factura-draft.pdf`, `Raport-vizita-<property>-<date>.pdf`), so multiple documents collide. Every generated PDF should be named:

```text
Vendor_Property_ServiceType_DDmmmYY.pdf
e.g. Serene_Garden_Acme_Gardens_1_Regular_Maintenance_2aug26.pdf
```

## What to build

1. **New helper `src/lib/doc-filename.ts`**
   - `buildDocFilename({ vendor, property, serviceType, date, prefix? })`
   - Slugifies each part (strip diacritics, non-alphanumerics → `_`, collapse repeats), skips empty parts, formats the date as `2aug26` (lowercase `d MMM yy`), appends `.pdf`.
   - Falls back gracefully when a part is missing (e.g. no property → omit it).

2. **Service type resolution** (shared helper in the same file)
   - One-time project contract → `One_time_Project`
   - Recurring contract → the contract name (e.g. `Regular Maintenance`)
   - Visit with no contract → `Ad_hoc_Visit`
   - Invoice with no contract → `Invoice`

3. **`src/lib/visit-report-pdf.ts`**
   - Replace the hardcoded `Raport-vizita-…` name with the helper, using provider name, property name, service type and the performed (or scheduled) date already present in `VisitPdfData`.

4. **`src/lib/invoice-pdf.ts`**
   - Accept optional meta (`vendorName`, `propertyName`, `serviceType`, `invoiceNumber`) and build the name with the helper, using the invoice issue date. Keep the invoice number as a trailing suffix so two invoices for the same property/month stay distinct; keep the old `Factura-…` name only when no meta is supplied.

5. **Call sites — pass the new meta**
   - `src/pages/provider/VisitDetail.tsx` (report + linked invoice export)
   - `src/pages/provider/InvoiceDetail.tsx`
   - `src/pages/provider/Billing.tsx`
   - These already load tenant and customer info; the invoice paths additionally need the property name (via `invoices.property_id` → `properties(name)`) and the contract's `contract_name` / `is_one_time_project`, added to the existing select statements.

6. **Share sheet titles** (Android/WhatsApp share) use the same generated name instead of the generic "Factură" label.

## Technical notes

- No database or business-logic changes; naming only.
- Diacritics are stripped so Romanian names stay filesystem-safe (`Grădina` → `Gradina`).
- Verification: typecheck plus manual export of one recurring-maintenance visit report and one project invoice to confirm distinct names.
