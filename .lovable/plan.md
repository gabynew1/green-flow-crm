# Simplify invoice lines

Verified on invoice `ea08770b…`: it has 11 lines — 1 flat fee (350), 1 ad-hoc (200) and 9 contract services at 0.00 that come from the visit report. Only the two priced lines matter for billing.

## Rule
An invoice shows only lines that carry cost. Services included in the flat fee are not billable lines.

## Changes

1. **Generation (SQL migration)**
   - `fn_ensure_cycle_invoice` / cycle + project + visit invoice functions: skip inserting contract line items where the resulting `line_total` is 0 and the item is included in the base fee. The flat-fee line and any priced contract line are still inserted; ad-hoc lines are unchanged.
   - One-off cleanup: delete existing 0-value `CONTRACT` lines from invoices still in `DRAFT`, then recompute subtotal/total (values unchanged since they were 0).

2. **Provider invoice view (`src/pages/provider/InvoiceDetail.tsx`)**
   - Filter out zero-total contract lines from the "Servicii contract" table.
   - Under that table, add a muted single line: "Include N servicii din contract, fără cost suplimentar" with an expandable list, so the scope stays visible without polluting the invoice.
   - Totals block unchanged (contract total / ad-hoc total / grand total).

3. **PDF (`src/lib/invoice-pdf.ts`)**
   - Same filter; print the included-services list as a compact footnote line rather than table rows.

4. **Client billing view**
   - Apply the same filtering so client-facing invoices match the provider view and the PDF.

## Result for this invoice
Servicii contract: Flat fee — Regular Maintenance (Monthly) 350 RON.
Servicii suplimentare: Consulting in choosing plants and materials 200 RON.
Total general: 550 RON, plus a note listing the 9 included services.
