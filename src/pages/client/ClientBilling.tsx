import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, CurrencyCode } from "@/lib/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Clock, CheckCircle2, CalendarClock } from "lucide-react";
import { format, differenceInDays, addMonths, addYears } from "date-fns";

type Invoice = {
  id: string;
  invoice_number: string | null;
  total: number;
  currency: string;
  status: "ISSUED" | "PAID" | "OVERDUE" | "CANCELED" | "DRAFT";
  due_date: string;
  issue_date: string;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  contract_id: string | null;
};

type Payment = {
  id: string;
  invoice_id: string;
  amount: number;
  paid_at: string;
  method: string;
  reference: string | null;
};

type UpcomingCycle = {
  contract_id: string;
  contract_name: string;
  next_period_start: string;
  estimated_total: number;
  currency: string;
};

export default function ClientBilling() {
  const { profile } = useAuth();
  const customerId = (profile as any)?.customer_id as string | undefined;
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingCycle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    (async () => {
      const [invRes, payRes, contractsRes] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, invoice_number, total, currency, status, due_date, issue_date, paid_at, period_start, period_end, contract_id")
          .eq("customer_id", customerId)
          .neq("status", "DRAFT")
          .order("due_date", { ascending: false })
          .limit(500),
        supabase
          .from("invoice_payments")
          .select("id, invoice_id, amount, paid_at, method, reference")
          .order("paid_at", { ascending: false })
          .limit(200),
        supabase
          .from("contracts")
          .select("id, contract_name, billing_cycle, start_date, status, properties!inner(customer_id), contract_line_items(unit_price, quantity)")
          .eq("status", "ACTIVE")
          .eq("properties.customer_id", customerId),
      ]);
      setInvoices((invRes.data as any) ?? []);
      setPayments((payRes.data as any) ?? []);

      const nextCycles: UpcomingCycle[] = ((contractsRes.data as any[]) ?? []).map((c) => {
        const total = ((c.contract_line_items ?? []) as any[]).reduce(
          (s, li) => s + Number(li.unit_price || 0) * Number(li.quantity || 1),
          0,
        );
        const startBase = c.start_date ? new Date(c.start_date) : new Date();
        const now = new Date();
        let next = startBase;
        const bump = c.billing_cycle === "YEARLY" ? (d: Date) => addYears(d, 1) : (d: Date) => addMonths(d, 1);
        while (next < now) next = bump(next);
        return {
          contract_id: c.id,
          contract_name: c.contract_name,
          next_period_start: format(next, "yyyy-MM-dd"),
          estimated_total: total,
          currency: "RON",
        };
      });
      setUpcoming(nextCycles);
      setLoading(false);
    })();
  }, [customerId]);

  const now = new Date();
  const overdue = useMemo(
    () => invoices.filter((i) => (i.status === "OVERDUE" || (i.status === "ISSUED" && new Date(i.due_date) < now))),
    [invoices],
  );
  const toPay = useMemo(
    () => invoices.filter((i) => i.status === "ISSUED" && new Date(i.due_date) >= now),
    [invoices],
  );
  const paid = useMemo(() => invoices.filter((i) => i.status === "PAID"), [invoices]);

  const overdueTotal = overdue.reduce((s, i) => s + Number(i.total), 0);
  const toPayTotal = toPay.reduce((s, i) => s + Number(i.total), 0);

  if (!customerId) {
    return <p className="text-sm text-muted-foreground">Cont neconectat la un client.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Plățile mele</h1>
        <p className="text-sm text-muted-foreground">Facturi curente, restanțe și istoric.</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Se încarcă…</p>
      ) : (
        <>
          {overdue.length > 0 && (
            <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-800 dark:text-red-200">
                  <AlertCircle className="h-5 w-5" />
                  Restanțe · {formatCurrency(overdueTotal, "RON")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {overdue.map((i) => {
                  const days = differenceInDays(new Date(), new Date(i.due_date));
                  return (
                    <InvoiceRow key={i.id} invoice={i} sub={<span className="text-red-700 dark:text-red-300">{days} zile întârziere</span>} />
                  );
                })}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                De plătit acum · {formatCurrency(toPayTotal, "RON")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {toPay.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nicio factură de plătit acum.</p>
              ) : (
                <div className="space-y-2">
                  {toPay.map((i) => (
                    <InvoiceRow key={i.id} invoice={i} sub={<span>Scadență {format(new Date(i.due_date), "dd MMM yyyy")}</span>} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-muted-foreground" />
                Următoarea plată (previzualizare)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">Niciun contract activ.</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((u) => (
                    <div key={u.contract_id} className="flex items-center justify-between rounded-md border p-3">
                      <div>
                        <p className="text-sm font-medium">{u.contract_name}</p>
                        <p className="text-xs text-muted-foreground">Următorul ciclu ~ {format(new Date(u.next_period_start), "dd MMM yyyy")}</p>
                      </div>
                      <span className="text-sm font-semibold text-muted-foreground">~ {formatCurrency(u.estimated_total, "RON")}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Istoric plăți
              </CardTitle>
            </CardHeader>
            <CardContent>
              {paid.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nicio plată încă.</p>
              ) : (
                <div className="space-y-2">
                  {paid.map((i) => {
                    const p = payments.find((pp) => pp.invoice_id === i.id);
                    return (
                      <InvoiceRow
                        key={i.id}
                        invoice={i}
                        sub={
                          <span className="text-emerald-700 dark:text-emerald-300">
                            Plătit {p ? format(new Date(p.paid_at), "dd MMM yyyy") : (i.paid_at ? format(new Date(i.paid_at), "dd MMM yyyy") : "")}
                          </span>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function InvoiceRow({ invoice, sub }: { invoice: Invoice; sub: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">
          {invoice.invoice_number || "Factură"}
          {invoice.period_start && (
            <span className="ml-2 text-xs text-muted-foreground">
              {format(new Date(invoice.period_start), "dd MMM")}
              {invoice.period_end && ` – ${format(new Date(invoice.period_end), "dd MMM yyyy")}`}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <div className="text-right">
        <p className="font-semibold">{formatCurrency(Number(invoice.total), (invoice.currency as CurrencyCode) || "RON")}</p>
        <Badge variant="outline" className="text-[10px]">{invoice.status}</Badge>
      </div>
    </div>
  );
}