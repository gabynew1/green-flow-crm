import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ArrowLeft, Check, X, Star } from "lucide-react";
import { toast } from "sonner";

export default function ClientVisitDetail() {
  const { visitId } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [existingFeedback, setExistingFeedback] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");

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
    if (fb) {
      setExistingFeedback(fb);
      setRating(fb.rating_stars);
      setComment(fb.comment || "");
    }
  };

  const approve = async () => {
    await supabase.from("service_orders").update({ status: "APPROVED" }).eq("id", visitId!);
    toast.success("Visit approved!");
    load();
  };

  const reject = async () => {
    await supabase.from("service_orders").update({
      status: "CANCELED" as any,
      notes: (order.notes ? order.notes + "\n" : "") + `Client rejection reason: ${rejectReason}`,
    }).eq("id", visitId!);
    toast.success("Visit rejected");
    load();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/client/visits"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{(order.properties as any)?.name}</h1>
          <p className="text-sm text-muted-foreground">{order.period_label} · {order.scheduled_date}</p>
        </div>
        <Badge variant="secondary">{order.status.replace(/_/g, " ")}</Badge>
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
              <p className="text-xs text-green-600">Covered by contract</p>
            </div>
            {adHocItems.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex-1 min-w-[140px]">
                <p className="text-xs text-muted-foreground mb-1">Additional Services</p>
                <p className="text-lg font-semibold">{adHocItems.length}</p>
                <p className="text-xs text-amber-600">Will be billed separately</p>
              </div>
            )}
            {adHocItems.length === 0 && contractItems.length > 0 && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex-1 min-w-[140px]">
                <p className="text-xs text-green-700 font-medium">✓ Fully covered</p>
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
            {contractItems.map(i => (
              <div key={i.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                <div className="flex items-center gap-2">
                  {i.is_completed && <Check className="h-4 w-4 text-success" />}
                  <span>{i.name}</span>
                </div>
                <span className="text-muted-foreground">{i.quantity} {i.unit}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {adHocItems.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Additional Services <span className="text-xs font-normal text-amber-600">(billed separately)</span></CardTitle></CardHeader>
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

      {/* Approve/Reject */}
      {order.status === "SENT_TO_CLIENT" && (
        <Card>
          <CardContent className="pt-6 flex gap-3">
            <Button className="flex-1" onClick={approve}><Check className="h-4 w-4 mr-2" /> Approve</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="flex-1"><X className="h-4 w-4 mr-2" /> Reject</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reject this visit report?</AlertDialogTitle>
                  <AlertDialogDescription>Please provide a reason so the provider can address your concerns.</AlertDialogDescription>
                </AlertDialogHeader>
                <Textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection…"
                  rows={3}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={reject} className="bg-destructive text-destructive-foreground">Reject</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}

      {/* Feedback */}
      {(order.status === "APPROVED" || order.status === "CANCELED") && !existingFeedback && (
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
