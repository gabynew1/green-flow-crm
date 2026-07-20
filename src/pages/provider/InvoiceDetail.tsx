import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { formatCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Trash2, Plus, Send, Check, RefreshCw, Download, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

type Invoice = {
  id: string;
  invoice_number: string | null;
  tenant_id: string;
  customer_id: string;
  contract_id: string | null;
  service_order_id: string | null;
  currency: string;
  status: "DRAFT" | "ISSUED" | "PAID" | "OVERDUE" | "CANCELED";
  source: string;
  issue_date: string;
  due_date: string;
  period_start: string | null;
  period_end: string | null;
  subtotal: number;
  total: number;
  paid_at: string | null;
  notes: string | null;
  customers?: { id: string; name: string | null; company_name: string | null } | null;
  contracts?: { id: string; contract_name: string | null } | null;
};

type Line = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  contract_line_item_id: string | null;
  service_order_item_id: string | null;
};

const STATUS_STYLE: Record<Invoice["status"], string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ISSUED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  OVERDUE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  CANCELED: "bg-muted text-muted-foreground line-through",
};

export default function InvoiceDetail() {
  const { invoiceId } = useParams();
  const navigate = useNavigate();
  const { tenantId, user } = useAuth();
  const currency = useTenantCurrency();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<{ paid_at: string; amount: number; recorder_name: string | null } | null>(null);
  const [tenantInfo, setTenantInfo] = useState<any>(null);
  const [customerInfo, setCustomerInfo] = useState<any>(null);

  const load = async () => {
    if (!invoiceId) return;
    const { data, error } = await supabase
      .from("invoices")
      .select("*, customers(id,name,company_name), contracts(id,contract_name)")
      .eq("id", invoiceId)
      .maybeSingle();
    if (error || !data) {
      toast.error("Factură negăsită");
      return;
    }
    setInvoice(data as any);
    setNotes((data as any).notes ?? "");
    const { data: l } = await supabase
      .from("invoice_line_items")
      .select("id, description, quantity, unit_price, line_total, contract_line_item_id, service_order_item_id")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: true });
    setLines((l as any) ?? []);

    // Payment audit trail
    const { data: pays } = await supabase
      .from("invoice_payments")
      .select("paid_at, amount, recorded_by_user_id")
      .eq("invoice_id", invoiceId)
      .order("paid_at", { ascending: false })
      .limit(1);
    const p = (pays as any)?.[0];
    if (p) {
      let recorderName: string | null = null;
      if (p.recorded_by_user_id) {
        const { data: prof } = await supabase
          .from("profiles").select("full_name, email").eq("user_id", p.recorded_by_user_id).maybeSingle();
        recorderName = (prof as any)?.full_name || (prof as any)?.email || null;
      }
      setPayment({ paid_at: p.paid_at, amount: Number(p.amount), recorder_name: recorderName });
    } else {
      setPayment(null);
    }

    // Party info for PDF (fetched once)
    if (!tenantInfo && (data as any).tenant_id) {
      const { data: t } = await supabase.from("tenants")
        .select("company_name, cui, vat_id, address_city, address_street, address_number, contact_email, contact_phone")
        .eq("id", (data as any).tenant_id).maybeSingle();
      setTenantInfo(t);
    }
    if ((data as any).customer_id) {
      const { data: c } = await supabase.from("customers")
        .select("name, company_name, cui, cnp, vat_id, address_city, address_street, address_number, email, phone")
        .eq("id", (data as any).customer_id).maybeSingle();
      setCustomerInfo(c);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [invoiceId]);

  const isDraft = invoice?.status === "DRAFT";

  const updateLine = async (id: string, patch: Partial<Line>) => {
    if (!isDraft) return;
    const { error } = await supabase.from("invoice_line_items").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const deleteLine = async (id: string) => {
    if (!isDraft) return;
    const { error } = await supabase.from("invoice_line_items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const addLine = async () => {
    if (!isDraft || !invoice || !tenantId) return;
    const { error } = await supabase.from("invoice_line_items").insert({
      invoice_id: invoice.id,
      tenant_id: tenantId,
      description: "Serviciu",
      quantity: 1,
      unit_price: 0,
    });
    if (error) { toast.error(error.message); return; }
    load();
  };

  const saveNotes = async () => {
    if (!invoice) return;
    await supabase.from("invoices").update({ notes: notes || null }).eq("id", invoice.id);
    toast.success("Salvat");
  };

  const regenerate = async () => {
    if (!invoice?.service_order_id) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("fn_generate_invoice_for_visit", {
      _service_order_id: invoice.service_order_id,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Draft regenerat din vizită");
    load();
  };

  const issueInvoice = async () => {
    if (!invoice) return;
    if (lines.length === 0) { toast.error("Nu poți emite o factură fără linii"); return; }
    setBusy(true);
    const { error } = await supabase
      .from("invoices")
      .update({ status: "ISSUED", issue_date: format(new Date(), "yyyy-MM-dd"), notes: notes || null })
      .eq("id", invoice.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Factură emisă");
    load();
  };

  const cancelInvoice = async () => {
    if (!invoice) return;
    const { error } = await supabase.from("invoices").update({ status: "CANCELED" }).eq("id", invoice.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Anulat");
    load();
  };

  const markPaid = async () => {
    if (!invoice || !tenantId) return;
    const { error } = await supabase.from("invoice_payments").insert({
      invoice_id: invoice.id,
      tenant_id: tenantId,
      amount: invoice.total,
      method: "TRANSFER",
      recorded_by_user_id: user?.id ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Marcată încasat");
    load();
  };

  const downloadPdf = () => {
    if (!invoice) return;
    const addr = (o: any) => [o?.address_street, o?.address_number, o?.address_city].filter(Boolean).join(", ") || null;
    const t = tenantInfo ?? {};
    const c = customerInfo ?? {};
    generateInvoicePdf(
      invoice as any,
      lines as any,
      { name: t.company_name, cui: t.cui, vat_id: t.vat_id, address: addr(t), email: t.contact_email, phone: t.contact_phone },
      { name: c.company_name || c.name, cui: c.cui, cnp: c.cnp, vat_id: c.vat_id, address: addr(c), email: c.email, phone: c.phone },
    );
  };

  if (!invoice) {
    return <div className="p-6 text-sm text-muted-foreground">Se încarcă…</div>;
  }

  const fmt = (n: number) => formatCurrency(n, (invoice.currency as any) || currency);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Înapoi
          </Button>
          <h1 className="text-2xl font-bold">
            {invoice.invoice_number || "Draft factură"}
          </h1>
          <Badge className={STATUS_STYLE[invoice.status]} variant="outline">{invoice.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {invoice.status !== "DRAFT" && (
            <Button variant="outline" size="sm" onClick={downloadPdf}>
              <Download className="h-4 w-4 mr-1" /> Descarcă PDF
            </Button>
          )}
          {isDraft && invoice.service_order_id && (
            <Button variant="outline" size="sm" onClick={regenerate} disabled={busy}>
              <RefreshCw className="h-4 w-4 mr-1" /> Regenerează din vizită
            </Button>
          )}
          {isDraft && (
            <Button variant="outline" size="sm" onClick={cancelInvoice}>Anulează draft</Button>
          )}
          {isDraft && (
            <Button size="sm" onClick={issueInvoice} disabled={busy}>
              <Send className="h-4 w-4 mr-1" /> Emite factura
            </Button>
          )}
          {(invoice.status === "ISSUED" || invoice.status === "OVERDUE") && (
            <Button size="sm" onClick={markPaid}>
              <Check className="h-4 w-4 mr-1" /> Marchează încasat
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Client</p>
          <Link to={`/provider/customers/${invoice.customer_id}`} className="font-semibold hover:underline">
            {invoice.customers?.company_name || invoice.customers?.name || "—"}
          </Link>
          {invoice.contracts && (
            <p className="text-xs text-muted-foreground mt-1">
              Contract: <Link to={`/provider/contracts/${invoice.contract_id}`} className="hover:underline">{invoice.contracts.contract_name || "—"}</Link>
            </p>
          )}
          {invoice.service_order_id && (
            <p className="text-xs text-muted-foreground mt-1">
              <Link to={`/provider/visits/${invoice.service_order_id}`} className="hover:underline">Vezi vizita ↗</Link>
            </p>
          )}
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Emisă / Scadență</p>
          <p className="font-semibold">{format(new Date(invoice.issue_date), "dd MMM yyyy")}</p>
          <p className="text-xs text-muted-foreground mt-1">Scadență: {format(new Date(invoice.due_date), "dd MMM yyyy")}</p>
          <p className="text-xs text-muted-foreground mt-1">Sursă: {invoice.source}</p>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
          <p className="text-2xl font-bold text-primary">{fmt(Number(invoice.total))}</p>
          <p className="text-xs text-muted-foreground mt-1">{lines.length} linii</p>
          {invoice.status === "PAID" && payment && (
            <div className="mt-2 pt-2 border-t flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
              <UserCheck className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <div>
                <div>Încasat de <span className="font-medium">{payment.recorder_name || "—"}</span></div>
                <div className="text-muted-foreground">{format(new Date(payment.paid_at), "dd MMM yyyy HH:mm")}</div>
              </div>
            </div>
          )}
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Linii factură</CardTitle>
          {isDraft && (
            <Button size="sm" variant="outline" onClick={addLine}>
              <Plus className="h-4 w-4 mr-1" /> Adaugă linie
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nicio linie.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descriere</TableHead>
                  <TableHead className="w-24 text-right">Cantitate</TableHead>
                  <TableHead className="w-32 text-right">Preț unitar</TableHead>
                  <TableHead className="w-32 text-right">Total</TableHead>
                  <TableHead>Sursă</TableHead>
                  {isDraft && <TableHead className="w-16" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      {isDraft ? (
                        <Input
                          defaultValue={l.description}
                          onBlur={(e) => e.target.value !== l.description && updateLine(l.id, { description: e.target.value })}
                        />
                      ) : l.description}
                    </TableCell>
                    <TableCell className="text-right">
                      {isDraft ? (
                        <Input
                          type="number"
                          step="0.01"
                          className="text-right"
                          defaultValue={l.quantity}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v) && v !== Number(l.quantity)) updateLine(l.id, { quantity: v });
                          }}
                        />
                      ) : Number(l.quantity)}
                    </TableCell>
                    <TableCell className="text-right">
                      {isDraft ? (
                        <Input
                          type="number"
                          step="0.01"
                          className="text-right"
                          defaultValue={l.unit_price}
                          onBlur={(e) => {
                            const v = Number(e.target.value);
                            if (!Number.isNaN(v) && v !== Number(l.unit_price)) updateLine(l.id, { unit_price: v });
                          }}
                        />
                      ) : fmt(Number(l.unit_price))}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{fmt(Number(l.line_total))}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {l.contract_line_item_id ? "Contract" : l.service_order_item_id ? "Ad-hoc" : "Manual"}
                    </TableCell>
                    {isDraft && (
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => deleteLine(l.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Note interne</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} disabled={!isDraft} />
          {isDraft && <Button size="sm" variant="outline" onClick={saveNotes}>Salvează note</Button>}
        </CardContent>
      </Card>
    </div>
  );
}