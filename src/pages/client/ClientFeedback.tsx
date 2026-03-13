import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Star, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function ClientFeedback() {
  const { user } = useAuth();
  const [feedback, setFeedback] = useState<any[]>([]);
  const [properties, setProperties] = useState<any[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);

  useEffect(() => { if (user) load(); }, [user]);

  const load = async () => {
    const { data: fb } = await supabase
      .from("feedback")
      .select("*, service_orders(period_label, properties(name))")
      .eq("customer_user_id", user!.id)
      .order("created_at", { ascending: false });
    setFeedback(fb ?? []);

    const { data: props } = await supabase.from("properties").select("id, name").order("name");
    setProperties(props ?? []);
  };

  const handleRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("service_orders").insert({
      property_id: form.get("property_id") as string,
      scheduled_date: (form.get("date") as string) || null,
      period_type: "ONE_TIME",
      period_label: "Ad-hoc request",
      status: "SCHEDULED",
      notes: form.get("description") as string,
      created_by_user_id: user!.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Request submitted! The provider will review it shortly.");
    setRequestOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Feedback & Requests</h1>
        <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New Request</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Request a Service</DialogTitle></DialogHeader>
            <form onSubmit={handleRequest} className="space-y-4">
              <div className="space-y-2">
                <Label>Property *</Label>
                <Select name="property_id" required>
                  <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                  <SelectContent>
                    {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Preferred Date</Label><Input name="date" type="date" /></div>
              <div className="space-y-2"><Label>What do you need? *</Label><Textarea name="description" required rows={4} placeholder="Describe the service you'd like…" /></div>
              <Button type="submit" className="w-full">Submit Request</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <h2 className="text-lg font-semibold">My Feedback</h2>
      <div className="space-y-3">
        {feedback.map(f => (
          <Card key={f.id}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star key={n} className={`h-4 w-4 ${n <= f.rating_stars ? "fill-accent text-accent" : "text-muted"}`} />
                    ))}
                  </div>
                  <p className="text-sm font-medium">{(f.service_orders as any)?.properties?.name}</p>
                  <p className="text-xs text-muted-foreground">{(f.service_orders as any)?.period_label}</p>
                  {f.comment && <p className="text-sm mt-1">{f.comment}</p>}
                </div>
                <span className="text-xs text-muted-foreground">{format(new Date(f.created_at), "MMM d, yyyy")}</span>
              </div>
            </CardContent>
          </Card>
        ))}
        {feedback.length === 0 && <p className="text-muted-foreground text-center py-8">No feedback given yet</p>}
      </div>
    </div>
  );
}
