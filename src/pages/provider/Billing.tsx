import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { formatCurrency } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Check, FileText, Send, Wallet, AlertCircle, Clock, Download, X } from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

type Invoice = {
  id: string;
  invoice_number: string | null;
  customer_id: string;
  contract_id: string | null;
  total: number;
  currency: string;
  status: "DRAFT" | "ISSUED" | "PAID" | "OVERDUE" | "CANCELED";
  due_date: string;
  issue_date: string;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  customers?: { name: string | null; company_name: string | null } | null;
  contracts?: { contract_name: string | null } | null;
};

const STATUS_STYLE: Record<Invoice["status"], string> = {
  DRAFT: "bg-muted text-muted-foreground",
  ISSUED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  OVERDUE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  CANCELED: "bg-muted text-muted-foreground line-through",
};

export default function Billing() {
  const { tenantId, user } = useAuth();
  const currency = useTenantCurrency();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") || "ALL");
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string | null>(searchParams.get("customer"));

  useEffect(() => {
    setStatusFilter(searchParams.get("status") || "ALL");
    setCustomerFilter(searchParams.get("customer"));
  }, [searchParams]);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, customer_id, contract_id, total, currency, status, due_date, issue_date, paid_at, period_start, period_end, customers(name,company_name), contracts(contract_name)")
      .eq("tenant_id", tenantId)
      .order("issue_date", { ascending: false })
      .limit(500);
    if (error) { toast.error(error.message); setLoading(false); return; }
    setInvoices((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId]);

  const monthStart = startOfMonth(new Date());
  const monthEnd = endOfMonth(new Date());

  const kpi = useMemo(() => {
    const inMonth = (d: string | null) => d && new Date(d) >= monthStart && new Date(d) <= monthEnd;
    const collected = invoices
      .filter((i) => i.status === "PAID" && inMonth(i.paid_at))
      .reduce((s, i) => s + Number(i.total), 0);
    const toCollect = invoices
      .filter((i) => (i.status === "ISSUED" || i.status === "OVERDUE") && inMonth(i.due_date))
      .reduce((s, i) => s + Number(i.total), 0);
    const overdue = invoices
      .filter((i) => i.status === "OVERDUE" || (i.status === "ISSUED" && new Date(i.due_date) < new Date()))
      .reduce((s, i) => s + Number(i.total), 0);
    const drafts = invoices.filter((i) => i.status === "DRAFT").length;
    return { collected, toCollect, overdue, drafts };
  }, [invoices, monthStart, monthEnd]);

  const filtered = useMemo(() => {
    return invoices.filter((i) => {
      if (statusFilter === "OVERDUE") {
        const overdue = i.status === "OVERDUE" || (i.status === "ISSUED" && new Date(i.due_date) < new Date());
        if (!overdue) return false;
      } else if (statusFilter !== "ALL" && i.status !== statusFilter) return false;
      if (customerFilter && i.customer_id !== customerFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = (i.customers?.company_name || i.customers?.name || "").toLowerCase();
        const num = (i.invoice_number || "").toLowerCase();
        if (!name.includes(q) && !num.includes(q)) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, search, customerFilter]);

  const customerFilterName = useMemo(() => {
    if (!customerFilter) return null;
    const found = invoices.find((i) => i.customer_id === customerFilter);
    return found?.customers?.company_name || found?.customers?.name || "Client";
  }, [customerFilter, invoices]);

  const clearCustomerFilter = () => {
    const p = new URLSearchParams(searchParams);
    p.delete("customer");
    setSearchParams(p, { replace: true });
  };

  const issueInvoice = async (inv: Invoice) => {
    const { error } = await supabase
      .from("invoices")
      .update({ status: "ISSUED", issue_date: format(new Date(), "yyyy-MM-dd") })
      .eq("id", inv.id);
    if (error) return toast.error(error.message);
    toast.success("Factură emisă");
    load();
  };

  const markPaid = async (inv: Invoice) => {
    if (!tenantId) return;
    const { error } = await supabase.from("invoice_payments").insert({
      invoice_id: inv.id,
      tenant_id: tenantId,
      amount: inv.total,
      method: "TRANSFER",
      recorded_by_user_id: user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    toast.success("Marcată încasat");
    load();
  };

  const downloadPdf = async (inv: Invoice) => {
    const [invRes, linesRes, tenantRes, customerRes] = await Promise.all([
      supabase.from("invoices").select("*").eq("id", inv.id).maybeSingle(),
      supabase.from("invoice_line_items").select("description, quantity, unit_price, line_total")
        .eq("invoice_id", inv.id).order("created_at", { ascending: true }),
      supabase.from("tenants").select("company_name, cui, vat_id, address_city, address_street, address_number, contact_email, contact_phone").eq("id", tenantId!).maybeSingle(),
      supabase.from("customers").select("name, company_name, cui, cnp, vat_id, address_city, address_street, address_number, email, phone").eq("id", inv.customer_id).maybeSingle(),
    ]);
    if (!invRes.data) { toast.error("Factură negăsită"); return; }
    const t: any = tenantRes.data ?? {};
    const c: any = customerRes.data ?? {};
    const addr = (o: any) => [o.address_street, o.address_number, o.address_city].filter(Boolean).join(", ") || null;
    generateInvoicePdf(
      invRes.data as any,
      (linesRes.data as any) ?? [],
      { name: t.company_name, cui: t.cui, vat_id: t.vat_id, address: addr(t), email: t.contact_email, phone: t.contact_phone },
      { name: c.company_name || c.name, cui: c.cui, cnp: c.cnp, vat_id: c.vat_id, address: addr(c), email: c.email, phone: c.phone },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Facturi & Încasări</h1>
        <p className="text-sm text-muted-foreground">Urmărește ce ai emis, încasat și restant.</p>
      </div>

      {customerFilter && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            Client: {customerFilterName}
            <button onClick={clearCustomerFilter} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard icon={<Wallet className="h-4 w-4" />} label="Încasat luna asta" value={formatCurrency(kpi.collected, currency as any)} tone="emerald" />
        <KpiCard icon={<Clock className="h-4 w-4" />} label="De încasat luna asta" value={formatCurrency(kpi.toCollect, currency as any)} tone="blue" />
        <KpiCard icon={<AlertCircle className="h-4 w-4" />} label="Restanțe" value={formatCurrency(kpi.overdue, currency as any)} tone="red" />
        <KpiCard icon={<FileText className="h-4 w-4" />} label="Draft" value={String(kpi.drafts)} tone="muted" />
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <CardTitle>Facturi</CardTitle>
          <div className="flex gap-2">
            <Input placeholder="Caută client sau nr…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toate</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="ISSUED">Emise</SelectItem>
                <SelectItem value="OVERDUE">Restanțe</SelectItem>
                <SelectItem value="PAID">Încasate</SelectItem>
                <SelectItem value="CANCELED">Anulate</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Se încarcă…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nicio factură.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nr</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead>Scadență</TableHead>
                  <TableHead className="text-right">Sumă</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acțiuni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => {
                  const overdue = inv.status === "ISSUED" && new Date(inv.due_date) < new Date();
                  const displayStatus = overdue ? "OVERDUE" : inv.status;
                  return (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => navigate(`/provider/invoices/${inv.id}`)}
                    >
                      <TableCell className="font-mono text-xs">{inv.invoice_number || "Draft"}</TableCell>
                      <TableCell>{inv.customers?.company_name || inv.customers?.name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.contract_id ? (inv.contracts?.contract_name || "Contract") : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{format(new Date(inv.due_date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(Number(inv.total), (inv.currency as any) || currency)}</TableCell>
                      <TableCell><Badge className={STATUS_STYLE[displayStatus as Invoice["status"]]} variant="outline">{displayStatus}</Badge></TableCell>
                      <TableCell className="text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                        {inv.status !== "DRAFT" && (
                          <Button size="sm" variant="ghost" title="Descarcă PDF" onClick={() => downloadPdf(inv)}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {inv.status === "DRAFT" && (
                          <Button size="sm" variant="outline" onClick={() => issueInvoice(inv)}>
                            <Send className="mr-1 h-3 w-3" /> Emite
                          </Button>
                        )}
                        {(inv.status === "ISSUED" || inv.status === "OVERDUE") && (
                          <Button size="sm" onClick={() => markPaid(inv)}>
                            <Check className="mr-1 h-3 w-3" /> Încasat
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "emerald" | "blue" | "red" | "muted" }) {
  const toneClass =
    tone === "emerald" ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20" :
    tone === "blue" ? "border-blue-200 bg-blue-50/50 dark:bg-blue-950/20" :
    tone === "red" ? "border-red-200 bg-red-50/50 dark:bg-red-950/20" :
    "";
  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}