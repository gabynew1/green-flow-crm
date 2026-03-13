import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle, FileOutput, Save } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  COMPLETED: "Completed",
  OFFER_GENERATED: "Offer Generated",
};

export default function InspectionDetail() {
  const { inspectionId } = useParams();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [inspection, setInspection] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [findings, setFindings] = useState("");
  const [inspectedDate, setInspectedDate] = useState("");

  useEffect(() => { load(); }, [inspectionId]);

  const load = async () => {
    const { data } = await supabase
      .from("inspections")
      .select("*, properties(name, customers(name))")
      .eq("id", inspectionId!)
      .single();
    if (data) {
      setInspection(data);
      setTitle(data.title);
      setNotes(data.notes || "");
      setFindings(data.findings || "");
      setInspectedDate(data.inspected_date || "");
    }
  };

  const save = async () => {
    await supabase.from("inspections").update({
      title, notes: notes || null, findings: findings || null,
      inspected_date: inspectedDate || null,
    }).eq("id", inspectionId!);
    toast.success("Saved!");
    load();
  };

  const complete = async () => {
    await supabase.from("inspections").update({
      status: "COMPLETED", title, notes: notes || null, findings: findings || null,
      inspected_date: inspectedDate || new Date().toISOString().split("T")[0],
    }).eq("id", inspectionId!);
    toast.success("Inspection completed!");
    load();
  };

  const generateOffer = async () => {
    if (!inspection) return;
    const { data: offer, error } = await supabase.from("offers").insert({
      inspection_id: inspectionId,
      property_id: inspection.property_id,
      customer_id: inspection.customer_id,
      tenant_id: inspection.tenant_id,
      offer_name: `Offer - ${inspection.title}`,
      notes: inspection.findings || null,
      created_by: user!.id,
    }).select().single();

    if (error) { toast.error(error.message); return; }

    await supabase.from("inspections").update({ status: "OFFER_GENERATED" }).eq("id", inspectionId!);
    toast.success("Offer created from inspection!");
    navigate(`/provider/offers/${offer.id}`);
  };

  if (!inspection) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  const isDraft = inspection.status === "DRAFT";
  const isCompleted = inspection.status === "COMPLETED";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/provider/inspections"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{inspection.title}</h1>
          <p className="text-sm text-muted-foreground">
            {(inspection.properties as any)?.customers?.name} · {(inspection.properties as any)?.name}
          </p>
        </div>
        <Badge variant="secondary">{statusLabels[inspection.status]}</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Inspection Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} disabled={!isDraft} />
          </div>
          <div className="space-y-2">
            <Label>Inspection Date</Label>
            <Input type="date" value={inspectedDate} onChange={e => setInspectedDate(e.target.value)} disabled={!isDraft} />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} disabled={!isDraft} placeholder="General notes…" />
          </div>
          <div className="space-y-2">
            <Label>Findings</Label>
            <Textarea value={findings} onChange={e => setFindings(e.target.value)} rows={5} disabled={!isDraft} placeholder="Detailed findings from the inspection…" />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        {isDraft && (
          <>
            <Button variant="secondary" onClick={save}><Save className="h-4 w-4 mr-2" /> Save Draft</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button><CheckCircle className="h-4 w-4 mr-2" /> Complete Inspection</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Complete this inspection?</AlertDialogTitle>
                  <AlertDialogDescription>Once completed, you can generate an offer from the findings.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={complete}>Complete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
        {isCompleted && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button><FileOutput className="h-4 w-4 mr-2" /> Generate Offer</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Generate offer from this inspection?</AlertDialogTitle>
                <AlertDialogDescription>An offer will be created with the inspection findings. You can add line items and pricing before sending to the client.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={generateOffer}>Generate</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
