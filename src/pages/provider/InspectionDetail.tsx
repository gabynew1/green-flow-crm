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
import { ArrowLeft, CalendarDays, CheckCircle, FileOutput, Save, Trees, ExternalLink, AlertTriangle, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { WorkflowEngine } from "@/lib/workflow-engine";
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
  const [lastSavedBy, setLastSavedBy] = useState<string | null>(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  // Inventory summary for the property of this inspection
  const [invCount, setInvCount] = useState<number>(0);
  const [invLastUpdate, setInvLastUpdate] = useState<string | null>(null);
  const [invMarkedByName, setInvMarkedByName] = useState<string | null>(null);

  useEffect(() => { load(); }, [inspectionId]);

  const load = async () => {
    const { data } = await supabase
      .from("inspections")
      .select("*, properties(id, name, address, city, customers(name, email, phone, company_name, contact_person_name))")
      .eq("id", inspectionId!)
      .single();
    if (data) {
      setInspection(data);
      setTitle(data.title);
      setNotes(data.notes || "");
      setInspectedDate(data.inspected_date || "");
      setCustomer((data.properties as any)?.customers || null);

      // Fetch last saved by user name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", data.created_by)
        .single();
      setLastSavedBy(profile?.full_name || null);

      // Inventory summary for the linked property
      const propertyId = (data.properties as any)?.id;
      if (propertyId) {
        const { data: invRow } = await supabase
          .from("inventory")
          .select("id")
          .eq("property_id", propertyId)
          .maybeSingle();
        if (invRow) {
          const { data: items } = await supabase
            .from("inventory_items")
            .select("updated_at")
            .eq("inventory_id", invRow.id)
            .order("updated_at", { ascending: false });
          setInvCount(items?.length ?? 0);
          setInvLastUpdate(items && items[0] ? items[0].updated_at : null);
        } else {
          setInvCount(0);
          setInvLastUpdate(null);
        }
      }

      // Who marked inventory complete (if anyone)
      if ((data as any).inventory_marked_complete_by) {
        const { data: markedProfile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", (data as any).inventory_marked_complete_by)
          .maybeSingle();
        setInvMarkedByName(markedProfile?.full_name || null);
      } else {
        setInvMarkedByName(null);
      }
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
    try {
      await WorkflowEngine.transitionInspection(inspectionId!, "SCHEDULED", {
        inspected_date: dateStr,
        title,
        notes: notes || null,
      });
      toast.success(`Inspection scheduled for ${format(selectedDate, "PPP")}`);
      setScheduleOpen(false);

      // Create a client confirmation task (Tasks → Schedule view)
      try {
        await supabase.rpc("emit_inspection_confirmation_task" as any, {
          _inspection_id: inspectionId,
          _scheduled_date: dateStr,
        });
      } catch (taskErr) {
        console.warn("Could not create inspection confirmation task", taskErr);
      }

      // Send inspection scheduled email to client
      if (inspection && customer?.email) {
        // Lookup customer id for the profile
        const customerId = inspection.customer_id;
        if (customerId) {
          const { data: clientProfile } = await supabase
            .from("profiles")
            .select("email")
            .eq("customer_id", customerId)
            .maybeSingle();
          const { data: tenant } = inspection.tenant_id
            ? await supabase.from("tenants").select("name").eq("id", inspection.tenant_id).single()
            : { data: null };
          const clientEmail = clientProfile?.email || customer?.email;
          if (clientEmail) {
            const { sendAppEmail } = await import("@/lib/send-app-email");
            sendAppEmail({
              templateName: "inspection-scheduled",
              recipientEmail: clientEmail,
              idempotencyKey: `inspection-scheduled-${inspectionId}`,
              tenantId: inspection.tenant_id ?? null,
              templateData: {
                inspectionTitle: title,
                propertyName: (inspection.properties as any)?.name,
                providerName: tenant?.name,
                scheduledDate: format(selectedDate, "PPP"),
              },
            });
          }
        }
      }

      load();
    } catch (e) {
      // Error handled by engine
    }
  };

  const generateOffer = async () => {
    if (!inspection) return;
    try {
      const { offerId } = await WorkflowEngine.completeInspectionAndGenerateOffer(inspectionId!, user!.id);
      toast.success("Offer created from inspection!");
      navigate(`/provider/offers/${offerId}`);
    } catch (e) {
      // Error handled by engine
    }
  };

  const markInventoryComplete = async () => {
    const { error } = await supabase
      .from("inspections")
      .update({
        inventory_marked_complete_at: new Date().toISOString(),
        inventory_marked_complete_by: user!.id,
      } as any)
      .eq("id", inspectionId!);
    if (error) { toast.error(error.message); return; }
    toast.success("Inventory marked complete");
    load();
  };

  const undoMarkInventoryComplete = async () => {
    const { error } = await supabase
      .from("inspections")
      .update({
        inventory_marked_complete_at: null,
        inventory_marked_complete_by: null,
      } as any)
      .eq("id", inspectionId!);
    if (error) { toast.error(error.message); return; }
    toast.success("Inventory mark cleared");
    load();
  };

  if (!inspection) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  const isDraft = inspection.status === "DRAFT";
  const isScheduled = inspection.status === "SCHEDULED";
  const property = inspection.properties as any;

  // Inventory state derivation
  const inspectedDateRef = inspection.inspected_date || inspection.created_at;
  const inspectedDateObj = inspectedDateRef ? new Date(inspectedDateRef) : null;
  const lastUpdateObj = invLastUpdate ? new Date(invLastUpdate) : null;
  const updatedAfterInspection =
    !!(lastUpdateObj && inspectedDateObj && lastUpdateObj > inspectedDateObj);
  const explicitlyMarked = !!(inspection as any).inventory_marked_complete_at;
  const inventoryReady = explicitlyMarked || (invCount > 0 && updatedAfterInspection);

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
            <div className="flex items-center justify-between">
              <Label>Notes</Label>
              {inspection?.updated_at && (
                <span className="text-[11px] text-muted-foreground">
                  Last saved: {format(new Date(inspection.updated_at), "PPp")}{lastSavedBy ? ` by ${lastSavedBy}` : ""}
                </span>
              )}
            </div>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="General notes…" />
          </div>
        </CardContent>
      </Card>

      {/* Property Inventory */}
      {!isDraft && property?.id && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trees className="h-4 w-4" /> Property Inventory
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                <span className="text-muted-foreground">Items:</span>{" "}
                <span className="font-medium">{invCount}</span>
              </span>
              {invLastUpdate && (
                <span>
                  <span className="text-muted-foreground">Last item update:</span>{" "}
                  <span className="font-medium">{format(new Date(invLastUpdate), "PP")}</span>
                </span>
              )}
              {inventoryReady ? (
                <Badge className="bg-green-500/10 text-green-700 border-green-500/30" variant="outline">
                  <CheckCircle className="h-3 w-3 mr-1" /> Inventory updated
                </Badge>
              ) : (
                <Badge variant="secondary">Inventory pending</Badge>
              )}
            </div>

            {explicitlyMarked && (
              <p className="text-xs text-muted-foreground">
                Marked complete{invMarkedByName ? ` by ${invMarkedByName}` : ""} on{" "}
                {format(new Date((inspection as any).inventory_marked_complete_at), "PPp")}
                {" · "}
                <button
                  type="button"
                  className="underline hover:text-foreground"
                  onClick={undoMarkInventoryComplete}
                >
                  <Undo2 className="h-3 w-3 inline mr-0.5" /> Undo
                </button>
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/provider/properties/${property.id}`)}
              >
                <ExternalLink className="h-4 w-4 mr-2" /> Open Property Inventory
              </Button>
              {isScheduled && !explicitlyMarked && (
                <Button size="sm" onClick={markInventoryComplete}>
                  <CheckCircle className="h-4 w-4 mr-2" /> Mark Inventory Complete
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
                <AlertDialogDescription>
                  {invCount > 0 && inventoryReady ? (
                    <>
                      <span className="font-medium text-foreground">{invCount}</span> item
                      {invCount === 1 ? "" : "s"} from the property inventory will be added as line items.
                      You can edit prices and details afterwards.
                    </>
                  ) : invCount === 0 ? (
                    <span className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        No inventory items exist for this property yet. The offer will be created empty —
                        consider updating the inventory first.
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        Inventory has not been updated since this inspection was scheduled.
                        {invCount} item{invCount === 1 ? "" : "s"} will still be imported as line items.
                      </span>
                    </span>
                  )}
                </AlertDialogDescription>
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
