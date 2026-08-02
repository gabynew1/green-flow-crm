import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { formatCurrency, CurrencyCode } from "@/lib/currency";
import { buildDocFilename, resolveServiceType } from "@/lib/doc-filename";

export type VisitPdfItem = {
  name: string;
  quantity: number;
  unit?: string | null;
  source: string;
  price: number;
  total: number;
};

export type VisitPdfData = {
  providerName?: string | null;
  propertyName?: string | null;
  customerName?: string | null;
  zoneName?: string | null;
  contractName?: string | null;
  isOneTimeProject?: boolean | null;
  status: string;
  performedDate?: string | null;
  scheduledDate?: string | null;
  periodLabel?: string | null;
  summary?: string | null;
  currency: string;
  flatFee: { isFlat: boolean; amount: number; suffix: string };
  items: VisitPdfItem[];
};

export function buildVisitReportPdf(data: VisitPdfData): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const currency = (data.currency || "RON") as CurrencyCode;
  const fmt = (n: number) => formatCurrency(n, currency, 2);

  // Header
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("RAPORT VIZITA", 15, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(data.providerName || "—", 15, 27);

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Status: ${data.status}`, 195, 20, { align: "right" });
  const performed = data.performedDate || data.scheduledDate;
  if (performed) {
    doc.text(`Data: ${format(new Date(performed), "dd MMM yyyy")}`, 195, 25, { align: "right" });
  }
  if (data.periodLabel) doc.text(`Perioada: ${data.periodLabel}`, 195, 30, { align: "right" });
  doc.setTextColor(0);

  // Details block
  let y = 42;
  const row = (label: string, value?: string | null) => {
    if (!value) return;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(label, 15, y);
    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text(value, 55, y);
    y += 6;
  };
  row("Proprietate", data.propertyName);
  row("Client", data.customerName);
  row("Zona", data.zoneName);
  row("Contract", data.contractName);

  const contractItems = data.items.filter((i) => i.source === "CONTRACT");
  const adHocItems = data.items.filter((i) => i.source !== "CONTRACT");

  const body: any[] = [];
  contractItems.forEach((i) =>
    body.push([
      i.name,
      "Contract",
      `${Number(i.quantity)} ${i.unit || ""}`.trim(),
      data.flatFee.isFlat ? "Inclus in abonament" : fmt(i.price),
      data.flatFee.isFlat ? "—" : fmt(i.total),
    ]),
  );
  adHocItems.forEach((i) =>
    body.push([
      i.name,
      "Ad-hoc",
      `${Number(i.quantity)} ${i.unit || ""}`.trim(),
      fmt(i.price),
      fmt(i.total),
    ]),
  );
  if (body.length === 0) body.push(["Fara servicii inregistrate", "", "", "", ""]);

  autoTable(doc, {
    startY: y + 4,
    head: [["Serviciu", "Tip", "Cant.", "Pret", "Total"]],
    body,
    theme: "striped",
    headStyles: { fillColor: [16, 185, 129], textColor: 255 },
    columnStyles: {
      1: { cellWidth: 22 },
      2: { halign: "right", cellWidth: 22 },
      3: { halign: "right", cellWidth: 35 },
      4: { halign: "right", cellWidth: 28 },
    },
    styles: { fontSize: 9 },
  });

  let endY = (doc as any).lastAutoTable?.finalY ?? y + 20;

  // Totals
  const adHocTotal = adHocItems.reduce((s, i) => s + i.total, 0);
  const contractTotal = data.flatFee.isFlat ? 0 : contractItems.reduce((s, i) => s + i.total, 0);
  doc.setFontSize(10);
  let ty = endY + 10;
  if (data.flatFee.isFlat) {
    doc.text(`Abonament ${data.flatFee.suffix}`.trim() + ":", 130, ty);
    doc.text(fmt(data.flatFee.amount), 195, ty, { align: "right" });
    ty += 6;
  } else if (contractTotal > 0) {
    doc.text("Servicii contract:", 130, ty);
    doc.text(fmt(contractTotal), 195, ty, { align: "right" });
    ty += 6;
  }
  doc.text("Servicii ad-hoc:", 130, ty);
  doc.text(fmt(adHocTotal), 195, ty, { align: "right" });
  ty += 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TOTAL:", 130, ty);
  doc.text(
    fmt((data.flatFee.isFlat ? data.flatFee.amount : contractTotal) + adHocTotal),
    195,
    ty,
    { align: "right" },
  );
  doc.setFont("helvetica", "normal");

  // Summary
  if (data.summary) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("Sumar pentru client:", 15, ty + 14);
    doc.setTextColor(0);
    const wrapped = doc.splitTextToSize(data.summary, 180);
    doc.text(wrapped, 15, ty + 20);
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text("Generat din GreenGrassCRM", 105, 290, { align: "center" });

  return {
    blob: doc.output("blob"),
    filename: buildDocFilename({
      vendor: data.providerName,
      property: data.propertyName,
      serviceType: resolveServiceType({
        contractName: data.contractName,
        isOneTimeProject: data.isOneTimeProject,
      }),
      date: performed ?? null,
    }),
  };
}
