import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { formatCurrency, CurrencyCode } from "@/lib/currency";
import { buildDocFilename, resolveServiceType } from "@/lib/doc-filename";

export type PdfInvoice = {
  invoice_number: string | null;
  status: string;
  currency: string;
  issue_date: string;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  subtotal: number;
  total: number;
  notes: string | null;
};

export type PdfLine = {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  line_group?: string | null;
};

export type PdfParty = {
  name: string | null;
  cui?: string | null;
  cnp?: string | null;
  vat_id?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
};

function line(doc: jsPDF, text: string, x: number, y: number, size = 9) {
  doc.setFontSize(size);
  doc.text(text, x, y);
}

function partyBlock(doc: jsPDF, title: string, p: PdfParty, x: number, y: number) {
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(title, x, y);
  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.text(p.name || "—", x, y + 5);
  doc.setFontSize(9);
  let cy = y + 11;
  const push = (t?: string | null) => { if (t) { doc.text(t, x, cy); cy += 4.5; } };
  push(p.cui ? `CUI: ${p.cui}` : null);
  push(p.vat_id ? `VAT: ${p.vat_id}` : null);
  push(p.cnp ? `CNP: ${p.cnp}` : null);
  push(p.address || null);
  push(p.email || null);
  push(p.phone || null);
}

export function buildInvoicePdf(
  invoice: PdfInvoice,
  lines: PdfLine[],
  seller: PdfParty,
  buyer: PdfParty,
  meta?: {
    vendorName?: string | null;
    propertyName?: string | null;
    contractName?: string | null;
    isOneTimeProject?: boolean | null;
  },
): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const currency = (invoice.currency || "RON") as CurrencyCode;
  const fmt = (n: number) => formatCurrency(n, currency, 2);

  // Header
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("FACTURA", 15, 20);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.invoice_number || "DRAFT", 15, 27);

  // Status pill (right)
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Status: ${invoice.status}`, 195, 20, { align: "right" });
  doc.text(`Emisa: ${format(new Date(invoice.issue_date), "dd MMM yyyy")}`, 195, 25, { align: "right" });
  doc.text(`Scadenta: ${format(new Date(invoice.due_date), "dd MMM yyyy")}`, 195, 30, { align: "right" });
  if (invoice.period_start && invoice.period_end) {
    doc.text(
      `Perioada: ${format(new Date(invoice.period_start), "dd MMM")} - ${format(new Date(invoice.period_end), "dd MMM yyyy")}`,
      195, 35, { align: "right" },
    );
  }
  doc.setTextColor(0);

  // Parties
  partyBlock(doc, "FURNIZOR", seller, 15, 45);
  partyBlock(doc, "CLIENT", buyer, 115, 45);

  // Line items — contract scope vs extra (ad-hoc) work
  const adhocLines = lines.filter((l) => l.line_group === "ADHOC");
  const allContractLines = lines.filter((l) => l.line_group !== "ADHOC");
  // Only cost-bearing lines are billed; flat-fee inclusions become a footnote.
  const contractLines = allContractLines.filter((l) => Number(l.line_total || 0) !== 0);
  const includedLines = allContractLines.filter((l) => Number(l.line_total || 0) === 0);
  const sum = (arr: PdfLine[]) => arr.reduce((s, l) => s + Number(l.line_total || 0), 0);

  const section = (title: string, rows: PdfLine[], startY: number) => {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(title, 15, startY);
    doc.setFont("helvetica", "normal");
    autoTable(doc, {
      startY: startY + 3,
      head: [["Descriere", "Cant.", "Pret unitar", "Total"]],
      body: rows.map((l) => [
        l.description,
        String(Number(l.quantity)),
        fmt(Number(l.unit_price)),
        fmt(Number(l.line_total)),
      ]),
      theme: "striped",
      headStyles: { fillColor: [16, 185, 129], textColor: 255 },
      columnStyles: {
        1: { halign: "right", cellWidth: 20 },
        2: { halign: "right", cellWidth: 35 },
        3: { halign: "right", cellWidth: 35 },
      },
      styles: { fontSize: 9 },
    });
    const y = ((doc as any).lastAutoTable?.finalY ?? startY + 10) + 6;
    doc.setFontSize(9);
    doc.text(`Subtotal ${title.toLowerCase()}:`, 130, y);
    doc.text(fmt(sum(rows)), 195, y, { align: "right" });
    return y + 8;
  };

  let cursorY = 90;
  if (adhocLines.length === 0) {
    cursorY = section("Servicii contract", contractLines, cursorY);
  } else {
    if (contractLines.length > 0) cursorY = section("Servicii contract", contractLines, cursorY);
    cursorY = section("Servicii suplimentare (in afara contractului)", adhocLines, cursorY);
  }

  if (includedLines.length > 0) {
    doc.setFontSize(8);
    doc.setTextColor(110);
    const note = `Include ${includedLines.length} servicii din contract, fara cost suplimentar: ${includedLines
      .map((l) => l.description)
      .join(", ")}.`;
    const wrappedNote = doc.splitTextToSize(note, 180);
    doc.text(wrappedNote, 15, cursorY);
    cursorY += wrappedNote.length * 4 + 4;
    doc.setTextColor(0);
  }

  const endY = cursorY;

  // Grand total
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TOTAL GENERAL:", 130, endY + 6);
  doc.text(fmt(Number(invoice.total)), 195, endY + 6, { align: "right" });
  doc.setFont("helvetica", "normal");

  // Notes
  if (invoice.notes) {
    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text("Note:", 15, endY + 30);
    const wrapped = doc.splitTextToSize(invoice.notes, 180);
    doc.text(wrapped, 15, endY + 35);
    doc.setTextColor(0);
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text("Generat din GreenGrassCRM", 105, 290, { align: "center" });

  const filename = buildDocFilename({
    prefix: "Factura",
    vendor: meta?.vendorName ?? seller.name,
    property: meta?.propertyName,
    serviceType: resolveServiceType({
      contractName: meta?.contractName,
      isOneTimeProject: meta?.isOneTimeProject,
      fallback: "Invoice",
    }),
    date: invoice.issue_date,
    suffix: invoice.invoice_number || "draft",
  });
  return { blob: doc.output("blob"), filename };
}

export function generateInvoicePdf(
  invoice: PdfInvoice,
  lines: PdfLine[],
  seller: PdfParty,
  buyer: PdfParty,
  meta?: Parameters<typeof buildInvoicePdf>[4],
) {
  const { blob, filename } = buildInvoicePdf(invoice, lines, seller, buyer, meta);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}