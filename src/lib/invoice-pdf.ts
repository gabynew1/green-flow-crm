import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { formatCurrency, CurrencyCode } from "@/lib/currency";

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

export function generateInvoicePdf(
  invoice: PdfInvoice,
  lines: PdfLine[],
  seller: PdfParty,
  buyer: PdfParty,
) {
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

  // Line items table
  autoTable(doc, {
    startY: 90,
    head: [["Descriere", "Cant.", "Pret unitar", "Total"]],
    body: lines.map((l) => [
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

  const endY = (doc as any).lastAutoTable?.finalY ?? 100;

  // Totals
  doc.setFontSize(10);
  doc.text("Subtotal:", 140, endY + 10);
  doc.text(fmt(Number(invoice.subtotal)), 195, endY + 10, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TOTAL:", 140, endY + 18);
  doc.text(fmt(Number(invoice.total)), 195, endY + 18, { align: "right" });
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

  const filename = `Factura-${(invoice.invoice_number || "draft").replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`;
  doc.save(filename);
}