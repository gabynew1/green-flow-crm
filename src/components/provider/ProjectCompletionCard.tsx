import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Send, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/currency";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";

type Props = {
  contract: any;
  contractId: string;
  tenantId: string | null;
  onRequestComplete: () => void;
};

type AdhocItem = { id: string; name: string; quantity: number; unit_price: number | null };

export function ProjectCompletionCard({ contract, contractId, tenantId, onRequestComplete }: Props) {
  const navigate = useNavigate();
  const currency = useTenantCurrency();
  const [adhoc, setAdhoc] = useState<AdhocItem[]>([]);
  const [contractTotal, setContractTotal] = useState(0);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "report" | "invoice">(null);

  const completed = contract?.status === "CLOSED";

  const load = async () => {
    const { data: lines } = await supabase
      .from("contract_line_items")
      .select("quantity, unit_price, is_included_in_base_fee")
      .eq("contract_id", contractId);
    setContractTotal(
      (lines ?? [])
        .filter((l: any) => !l.is_included_in_base_fee)
        .reduce((s: number, l: any) => s + Number(l.quantity || 1) * Number(l.unit_price || 0), 0),
    );

    const { data: visits } = await supabase
      .from("service_orders")
      .select("id, status")
      .eq("contract_id", contractId);
    const ids = (visits ?? [])
      .filter((v: any) => ["COMPLETED", "APPROVED", "SENT_TO_CLIENT"].includes(v.status))
      .map((v: any) => v.id);
    if (ids.length > 0) {
      const { data: items } = await supabase
        .from("service_order_items")
        .select("id, name, quantity, unit_price")
        .in("service_order_id", ids)
        .eq("source", "AD_HOC")
        .eq("is_completed", true);
      setAdhoc((items as any) ?? []);
    } else {
      setAdhoc([]);
    }

    const { data: inv } = await supabase
      .from("invoices")
      .select("id")
      .eq("contract_id", contractId)
      .eq("source", "CONTRACT_CYCLE")
      .neq("status", "CANCELED")
      .maybeSingle();
    setInvoiceId((inv as any)?.id ?? null);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [contractId, contract?.status]);

  const adhocTotal = adhoc.reduce((s, i) => s + Number(i.quantity || 1) * Number(i.unit_price || 0), 0);
  const grandTotal = contractTotal + adhocTotal;
  const fmt = (n: number) => formatCurrency(n, currency);
  const unpriced = adhoc.filter((i) => !i.unit_price || Number(i.unit_price) === 0).length;

  const sendReport = async () => {
    setBusy("report");
    try {
      const customerId = contract?.properties?.customers?.id || contract?.properties?.customer_id;
      if (!customerId) { toast.error("No client account linked to this property"); return; }
      const { data: clientProfile } = await supabase
        .from("profiles").select("email").eq("customer_id", customerId).maybeSingle();
      if (!clientProfile?.email) { toast.error("Linked client has no email on file"); return; }
      const { data: tenant } = tenantId
        ? await supabase.from("tenants").select("name").eq("id", tenantId).single()
        : { data: null as any };

      const { data: lines } = await supabase
        .from("contract_line_items")
        .select("quantity, custom_name, is_included_in_base_fee, service_catalog(name)")
        .eq("contract_id", contractId);

      const { sendAppEmail } = await import("@/lib/send-app-email");
      await sendAppEmail({
        templateName: "project-report",
        recipientEmail: clientProfile.email,
        idempotencyKey: `project-report-${contractId}-${Date.now()}`,
        tenantId: tenantId ?? null,
        templateData: {
          contractName: contract.contract_name,
          propertyName: contract?.properties?.name,
          providerName: tenant?.name,
          contractItems: (lines ?? []).map((l: any) => ({
            name: l.custom_name || l.service_catalog?.name || "Serviciu",
            quantity: Number(l.quantity || 1),
          })),
          adhocItems: adhoc.map((i) => ({ name: i.name, quantity: Number(i.quantity || 1) })),
          contractTotal: fmt(contractTotal),
          adhocTotal: fmt(adhocTotal),
          grandTotal: fmt(grandTotal),
        },
      });
      toast.success("Completion report sent to client");
    } finally {
      setBusy(null);
    }
  };

  const generateInvoice = async () => {
    setBusy("invoice");
    const { data, error } = await (supabase.rpc as any)("fn_generate_invoice_for_project", {
      _contract_id: contractId,
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    if (!data) { toast.error("Nothing to invoice"); return; }
    toast.success("Project invoice generated");
    navigate(`/provider/invoices/${data}`);
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          One-time project
          <Badge variant={completed ? "default" : "secondary"}>{completed ? "Completed" : "In delivery"}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Contract services</p>
            <p className="font-semibold">{fmt(contractTotal)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Additional (ad-hoc)</p>
            <p className="font-semibold">{fmt(adhocTotal)}</p>
            <p className="text-xs text-muted-foreground">{adhoc.length} items</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Grand total</p>
            <p className="font-bold text-primary">{fmt(grandTotal)}</p>
          </div>
        </div>

        {unpriced > 0 && !completed && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {unpriced} ad-hoc item(s) have no price — they will be invoiced at 0.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={completed || contract?.status !== "ACTIVE"} onClick={onRequestComplete}>
            <CheckCircle2 className="h-3 w-3 mr-1" /> 1. Mark project completed
          </Button>
          <Button size="sm" variant="outline" disabled={!completed || busy === "report"} onClick={sendReport}>
            {busy === "report" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
            2. Send report to client
          </Button>
          {invoiceId ? (
            <Button size="sm" variant="outline" onClick={() => navigate(`/provider/invoices/${invoiceId}`)}>
              <FileText className="h-3 w-3 mr-1" /> Open project invoice
            </Button>
          ) : (
            <Button size="sm" disabled={!completed || busy === "invoice"} onClick={generateInvoice}>
              {busy === "invoice" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileText className="h-3 w-3 mr-1" />}
              3. Generate invoice
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}