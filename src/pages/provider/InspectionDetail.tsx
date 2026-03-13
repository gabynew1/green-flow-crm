import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { ArrowLeft, CalendarDays, CheckCircle, FileOutput, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const statusLabels: Record<string, string> = {
  DRAFT: "Opportunity",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  OFFER_GENERATED: "Offer Generated",
};

export default function InspectionDetail() {
  const { inspectionId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [inspection, setInspection] = useState<any>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [customer, setCustomer] = useState<any>(null);
  const [inspectedDate, setInspectedDate] = useState("");

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  useEffect(() => { load(); }, [inspectionId]);

  const load = async () => {
    const { data } = await supabase
      .from("inspections")
      .select("*, properties(name, address, city, customers(name, email, phone, company_name, contact_person_name))")
      .eq("id", inspectionId!)
      .single();
    if (data) {
      setInspection(data);
      setTitle(data.title);
      setNotes(data.notes || "");
      setInspectedDate(data.inspected_date || "");
      setCustomer((data.properties as any)?.customers || null);
    }
  };

  const save = async () => {
    await supabase.from("inspections").update({
      title, notes: notes || null,
      inspected_date: inspectedDate || null,
    }).eq("id", inspectionId!);
    toast.success("Saved!");
    load();
  };

  const scheduleInspection = async () => {
    if (!selectedDate) return;
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const { error } = await supabase.from("inspections").update({
      status: "SCHEDULED",
      inspected_date: dateStr,
      title,
      notes: notes || null,
    }).eq("id", inspectionId!);
    if (error) { toast.error(error.message); return; }
    toast.success(`Inspection scheduled for ${format(selectedDate, "PPP")}`);
    setScheduleOpen(false);
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

    await supabase.from("inspections").update({ status: "COMPLETED" }).eq("id", inspectionId!);
    toast.success("Offer created from inspection!");
    navigate(`/provider/offers/${offer.id}`);
  };

  if (!inspection) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  const isDraft = inspection.status === "DRAFT";
  const isScheduled = inspection.status === "SCHEDULED";
  const property = inspection.properties as any;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/provider/pipeline"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{inspection.title}</h1>
          <p className="text-sm text-muted-foreground">
            {property?.customers?.name} · {property?.name}
          </p>
        </div>
        <Badge variant={isDraft ? "secondary" : isScheduled ? "default" : "outline"}>{statusLabels[inspection.status]}</Badge>
      </div>

      {/* Property & Contact info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Property</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>
                <p className="font-medium">{property?.name}</p>
              </div>
              {property?.address && (
                <div>
                  <span className="text-muted-foreground">Address:</span>
                  <p className="font-medium">{[property.address, property.city].filter(Boolean).join(", ")}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Customer:</span>
                <p className="font-medium">{customer?.name || "—"}</p>
              </div>
              {customer?.contact_person_name && (
                <div>
                  <span className="text-muted-foreground">Contact Person:</span>
                  <p className="font-medium">{customer.contact_person_name}</p>
                </div>
              )}
              {customer?.email && (
                <div>
                  <span className="text-muted-foreground">Email:</span>
                  <p className="font-medium">{customer.email}</p>
                </div>
              )}
              {customer?.phone && (
                <div>
                  <span className="text-muted-foreground">Phone:</span>
                  <p className="font-medium">{customer.phone}</p>
                </div>
              )}
              {customer?.company_name && (
                <div>
                  <span className="text-muted-foreground">Company:</span>
                  <p className="font-medium">{customer.company_name}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details */}
      <Card>
        <CardHeader><CardTitle className="text-base">{isDraft ? "Opportunity Details" : "Inspection Details"}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          {(isScheduled || inspection.status === "COMPLETED" || inspection.status === "OFFER_GENERATED") && (
            <div className="space-y-2">
              <Label>Scheduled Date</Label>
              <Input type="date" value={inspectedDate} onChange={e => setInspectedDate(e.target.value)} />
            </div>
          )}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="General notes…" />
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <Button variant="secondary" onClick={save}><Save className="h-4 w-4 mr-2" /> Save</Button>
        {isDraft && (
          <Button onClick={() => { setSelectedDate(undefined); setScheduleOpen(true); }}>
            <CalendarDays className="h-4 w-4 mr-2" /> Schedule Inspection
          </Button>
        )}
        {isScheduled && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button><FileOutput className="h-4 w-4 mr-2" /> Generate Offer</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Generate offer from this inspection?</AlertDialogTitle>
                <AlertDialogDescription>An offer will be created from this inspection. You can add line items and pricing before sending to the client.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={generateOffer}>Generate</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* Schedule Inspection Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Inspection</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <p className="text-sm text-muted-foreground text-center">
              Pick a date for the on-site inspection at <span className="font-medium text-foreground">{property?.name}</span>
            </p>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              className={cn("p-3 pointer-events-auto rounded-md border")}
            />
            {selectedDate && (
              <p className="text-sm font-medium">
                Selected: {format(selectedDate, "PPPP")}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button onClick={scheduleInspection} disabled={!selectedDate}>
              <CalendarDays className="h-4 w-4 mr-2" /> Confirm Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
