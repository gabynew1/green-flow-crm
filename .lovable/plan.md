## Goal

On a completed visit, add a **Download PDF** action next to "Send Report to Client" (visit report, plus the linked invoice when one exists), and add a **Share** action that opens the phone's native share sheet (WhatsApp, Telegram, Mail, Drive…) on mobile.

## 1. Visit report PDF

New `src/lib/visit-report-pdf.ts`, built with the existing `jspdf` + `jspdf-autotable` setup so it looks like the current invoice PDF (same emerald header, A4, mm units):

- Header: "Raport vizita", provider name, visit status, performed date
- Property, customer, service zone, contract name
- Table of services: contract items and ad-hoc items, quantity, price (contract lines show "Inclus in abonament" when the contract is flat-fee), totals block with flat fee + ad-hoc total
- Client summary / notes section
- Footer "Generat din GreenGrassCRM"

The generator returns a `Blob` + suggested filename rather than saving directly, so the same output can be downloaded or shared.

## 2. Refactor invoice PDF for reuse

`src/lib/invoice-pdf.ts` currently ends in `doc.save(...)`. Split it into `buildInvoicePdf(...) -> { blob, filename }` and keep `generateInvoicePdf(...)` as a thin wrapper that downloads, so the Billing page and invoice detail page keep working unchanged.

## 3. UI on the completed-visit banner

In `src/pages/provider/VisitDetail.tsx`, replace the single button in the completed banner with a small action group:

- **Send Report to Client** (existing behaviour)
- **Download PDF** — dropdown when an invoice is linked to the visit: "Visit report" / "Invoice"; a plain button when there is no invoice
- **Share** — only rendered when the browser supports it (see below)

Invoice lookup: query `invoices` for one linked to this visit's contract/period (the same record the completion flow already surfaces as a draft invoice). If none exists, only the visit report option is offered.

## 4. Native mobile share (Web Share API)

New helper `src/lib/share-file.ts`:

```text
canShareFiles()  -> !!navigator.canShare?.({ files: [probe] })
shareFile(blob, filename, title, text)
   -> navigator.share({ files: [new File(...)], title, text })
   -> fallback: download the file + toast "Sharing not supported, file downloaded"
```

Behaviour by platform:

- **Android Chrome / iOS Safari 15+**: `navigator.share` with a PDF file opens the OS share sheet — WhatsApp, Telegram, Gmail, Drive, etc. This is the standard and only way to reach those apps; there is no direct per-app API.
- **Desktop**: file sharing is largely unsupported, so the Share button is hidden and Download is used instead.
- Requires HTTPS (the published domain and preview both qualify) and must be triggered by a user gesture — the button click satisfies this.

The Share button uses the same dropdown choice (report vs invoice) when both exist.

## 5. Also wire the same share/download into the invoice page

`src/pages/provider/Billing.tsx` (and the invoice detail route) get a Share button next to the existing PDF download, reusing `shareFile`, so invoices can be sent through WhatsApp on mobile too.

## Technical notes

- No new dependencies; `jspdf` and `jspdf-autotable` are already installed.
- No database or edge-function changes; everything is client-side rendering of data already loaded on the page.
- jsPDF's built-in Helvetica has limited Romanian diacritics support; text is emitted as-is like the current invoice PDF (unchanged behaviour). If diacritics render poorly we can register a Unicode font in a follow-up.
