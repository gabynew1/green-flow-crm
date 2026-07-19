import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Check, Star } from "lucide-react";
import { toast } from "sonner";
import { getVisitScopeStatus } from "@/lib/contract-consumption";
import { visitStatusColor, visitStatusLabel } from "@/lib/visit-status";

export default function ClientVisitDetail() {
  const { visitId } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [existingFeedback, setExistingFeedback] = useState<any>(null);
  const [scopeMap, setScopeMap] = useState<Map<string, { inScope: boolean; consumed: number; max: number | null; periodLabel: string }>>(new Map());

  useEffect(() => { load(); }, [visitId]);

  const load = async () => {
    const { data: o } = await supabase
      .from("service_orders")
      .select("*, properties(name)")
      .eq("id", visitId!)
      .single();
    setOrder(o);

    const { data: itms } = await supabase
      .from("service_order_items")
      .select("*")
      .eq("service_order_id", visitId!);
    setItems(itms ?? []);

    const { data: fb } = await supabase
      .from("feedback")
      .select("*")
      .eq("service_order_id", visitId!)
      .maybeSingle();
    // Load scope status
    if (o?.contract_id) {
      const { data: ctr } = await supabase.from("contracts").select("start_date, end_date").eq("id", o.contract_id).single();
      const sm = await getVisitScopeStatus(visitId!, o.contract_id, ctr?.start_date, ctr?.end_date);
      setScopeMap(sm);
    }

    if (fb) {
      setExistingFeedback(fb);
      setRating(fb.rating_stars);
      setComment(fb.comment || "");
    }
  };

  const submitFeedback = async () => {
    if (rating === 0) { toast.error("Please select a rating"); return; }
    const { error } = await supabase.from("feedback").insert({
      service_order_id: visitId!,
      customer_user_id: user!.id,
      rating_stars: rating,
      comment: comment || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Thank you for your feedback!");
    load();
  };

  if (!order) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  const contractItems = items.filter(i => i.source === "CONTRACT");
  const adHocItems = items.filter(i => i.source === "AD_HOC");
  const displayStatus = visitStatusLabel(order.status);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/client/visits"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{(order.properties as any)?.name}</h1>
          <p className="text-sm text-muted-foreground">{order.period_label} · {order.scheduled_date}</p>
        </div>
        {order.needs_client_action && (
          <Badge variant="outline" className="text-[10px] border-warning text-warning">Needs your review</Badge>
        )}
        <Badge className={visitStatusColor(order.status)} variant="secondary">
          {displayStatus}
        </Badge>
      </div>

      {order.client_summary && (
        <Card>
          <CardHeader><CardTitle className="text-base">Visit Summary</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{order.client_summary}</p></CardContent>
        </Card>
      )}

      {/* Billing summary for client */}
      <Card>
        <CardHeader><CardTitle className="text-base">Billing</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="rounded-lg border p-3 flex-1 min-w-[140px]">
              <p className="text-xs text-muted-foreground mb-1">Contract Services</p>
              <p className="text-lg font-semibold">{contractItems.length}</p>
              <p className="text-xs text-success">Covered by contract</p>
            </div>
            {adHocItems.length > 0 && (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex-1 min-w-[140px]">
                <p className="text-xs text-muted-foreground mb-1">Additional Services</p>
                <p className="text-lg font-semibold">{adHocItems.length}</p>
                <p className="text-xs text-warning">Will be billed separately</p>
              </div>
            )}
            {adHocItems.length === 0 && contractItems.length > 0 && (
              <div className="rounded-lg border border-success/30 bg-success/5 p-3 flex-1 min-w-[140px]">
                <p className="text-xs text-success font-medium">✓ Fully covered</p>
                <p className="text-xs text-muted-foreground mt-1">No additional charges</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {contractItems.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Contract Services</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {contractItems.map(i => {
              const scope = scopeMap.get(i.id);
              return (
                <div key={i.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    {i.is_completed && <Check className="h-4 w-4 text-success" />}
                    <span>{i.name}</span>
                    {scope?.max != null && (
                      <Badge
                        variant={scope.inScope ? "default" : "destructive"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {scope.inScope ? "In Scope" : "Extra"}
                      </Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    {i.quantity} {i.unit}
                    {scope?.max != null && <span className="ml-1 text-xs">({scope.consumed}/{scope.max})</span>}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {adHocItems.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Additional Services <span className="text-xs font-normal text-warning">(billed separately)</span></CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {adHocItems.map(i => (
              <div key={i.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                <span>{i.name}</span>
                <span className="text-muted-foreground">{i.quantity} {i.unit}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Feedback — available after visit is completed */}
      {order.status === "COMPLETED" && !existingFeedback && (
        <Card>
          <CardHeader><CardTitle className="text-base">Leave Feedback</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setRating(n)} className="p-1">
                  <Star className={`h-6 w-6 ${n <= rating ? "fill-accent text-accent" : "text-muted"}`} />
                </button>
              ))}
            </div>
            <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Optional comment…" rows={3} />
            <Button onClick={submitFeedback}>Submit Feedback</Button>
          </CardContent>
        </Card>
      )}

      {existingFeedback && (
        <Card>
          <CardHeader><CardTitle className="text-base">Your Feedback</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-1 mb-2">
              {[1, 2, 3, 4, 5].map(n => (
                <Star key={n} className={`h-5 w-5 ${n <= existingFeedback.rating_stars ? "fill-accent text-accent" : "text-muted"}`} />
              ))}
            </div>
            {existingFeedback.comment && <p className="text-sm">{existingFeedback.comment}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
