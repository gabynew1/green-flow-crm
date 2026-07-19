import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, MapPin, Pencil, Trash2, Copy, Unlink } from "lucide-react";
import { toast } from "sonner";

export default function ClientPropertyDetail() {
  const { propertyId } = useParams();
  const navigate = useNavigate();
  const [property, setProperty] = useState<any>(null);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [recentVisits, setRecentVisits] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [contractLines, setContractLines] = useState<Record<string, any[]>>({});

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", address: "", city: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [delinking, setDelinking] = useState(false);
  const [providerName, setProviderName] = useState<string | null>(null);

  useEffect(() => { load(); }, [propertyId]);

  const load = async () => {
    const { data: p } = await supabase
      .from("properties")
      .select("*, tenants(name)")
      .eq("id", propertyId!)
      .single();
    setProperty(p);
    setProviderName((p as any)?.tenants?.name ?? null);
    if (p) setEditForm({ name: p.name, address: p.address ?? "", city: p.city ?? "", description: p.description ?? "" });

    const { data: inv } = await supabase.from("inventory").select("id").eq("property_id", propertyId!).single();
    if (inv) {
      const { data: items } = await supabase.from("inventory_items").select("*").eq("inventory_id", inv.id).order("category");
      setInventoryItems(items ?? []);
    }

    const { data: visits } = await supabase
      .from("service_orders")
      .select("id, scheduled_date, period_label, status")
      .eq("property_id", propertyId!)
      .order("scheduled_date", { ascending: true })
      .limit(5);
    setRecentVisits(visits ?? []);

    // Contracts
    const { data: ctrs } = await supabase
      .from("contracts")
      .select("*")
      .eq("property_id", propertyId!)
      .order("start_date", { ascending: false });
    setContracts(ctrs ?? []);

    // Contract line items with service catalog names
    if (ctrs && ctrs.length > 0) {
      const lines: Record<string, any[]> = {};
      for (const c of ctrs) {
        const { data: items } = await supabase
          .from("contract_line_items")
          .select("*, service_catalog(name)")
          .eq("contract_id", c.id);
        lines[c.id] = items ?? [];
      }
      setContractLines(lines);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("properties").update({
      name: editForm.name.trim(),
      address: editForm.address.trim() || null,
      city: editForm.city.trim() || null,
      description: editForm.description.trim() || null,
    }).eq("id", propertyId!);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Property updated!");
    setEditOpen(false);
    load();
  };

  const handleDelete = async () => {
    const { error } = await supabase.from("properties").delete().eq("id", propertyId!);
    if (error) { toast.error(error.message); return; }
    toast.success("Property deleted");
    navigate("/client");
  };

  const blockingContracts = contracts.filter(
    (c) => !c.archived && (c.status === "ACTIVE" || c.status === "SENT_TO_CLIENT")
  );
  const canDelink = !!property?.tenant_id && blockingContracts.length === 0;

  const handleDelink = async () => {
    setDelinking(true);
    const { data, error } = await supabase.rpc("client_delink_property", {
      _property_id: propertyId!,
    });
    setDelinking(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const canceled = (data as any)?.canceled_visits ?? 0;
    toast.success(
      canceled > 0
        ? `Property delinked. Canceled ${canceled} upcoming visit${canceled === 1 ? "" : "s"}.`
        : "Property delinked. You can now connect it to another provider."
    );
    load();
  };

  const contractStatusColor = (s: string) => {
    switch (s) {
      case "ACTIVE": return "default";
      case "DRAFT": return "secondary";
      case "PAUSED": return "outline";
      default: return "destructive";
    }
  };

  if (!property) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/client"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <h1 className="text-2xl font-bold">{property.name}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
          {property.tenant_id && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canDelink || delinking}
                  title={
                    !canDelink
                      ? "Active or pending contract — close it first to delink"
                      : undefined
                  }
                >
                  <Unlink className="h-4 w-4 mr-1" /> Delink from provider
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delink from {providerName ?? "this provider"}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {providerName ?? "The provider"} will lose access to "{property.name}".
                    Any upcoming visits they have scheduled will be canceled.
                    You can connect this property to another provider afterwards.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelink} disabled={delinking}>
                    {delinking ? "Delinking…" : "Confirm delink"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Property</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete "{property.name}" and cannot be undone. Related contracts and visits may be affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Property</DialogTitle></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Address</Label>
                <Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Property info */}
      <Card>
        <CardContent className="pt-6 text-sm space-y-3">
          {property.unique_property_id && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Property ID:</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(property.unique_property_id);
                  toast.success("Property ID copied!");
                }}
                className="flex items-center gap-1 font-mono text-sm bg-muted px-2 py-0.5 rounded hover:bg-muted/80 transition-colors"
                title="Click to copy"
              >
                {property.unique_property_id}
                <Copy className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-1"><MapPin className="h-4 w-4 text-muted-foreground" /> {[property.address, property.city].filter(Boolean).join(", ") || "No address"}</div>
          {property.description && <p className="text-muted-foreground">{property.description}</p>}
        </CardContent>
      </Card>

      {/* Contracts & Services */}
      <Card>
        <CardHeader><CardTitle className="text-base">Contracts & Services</CardTitle></CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contracts for this property</p>
          ) : (
            <div className="space-y-4">
              {contracts.map((c) => (
                <div key={c.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{c.contract_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.start_date} → {c.end_date || "Ongoing"}
                      </p>
                    </div>
                    <Badge variant={contractStatusColor(c.status) as any}>{c.status}</Badge>
                  </div>
                  {(contractLines[c.id] ?? []).length > 0 && (
                    <div className="border-t pt-2 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Services</p>
                      {(contractLines[c.id] ?? []).map((li) => (
                        <div key={li.id} className="flex items-center justify-between text-sm py-1">
                          <span>{(li as any).service_catalog?.name ?? li.custom_name ?? "Service"}</span>
                          <span className="text-muted-foreground text-xs">
                            {li.quantity} × {li.frequency_type.replace(/_/g, " ").toLowerCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Green Inventory */}
      <Card>
        <CardHeader><CardTitle className="text-base">Green Inventory</CardTitle></CardHeader>
        <CardContent>
          {inventoryItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inventory data available</p>
          ) : (
            <div className="space-y-2">
              {inventoryItems.map(item => (
                <div key={item.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                  <span>{item.name}</span>
                  <span className="text-muted-foreground">{item.quantity} {item.unit}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Visits */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recent Service Visits</CardTitle></CardHeader>
        <CardContent>
          {recentVisits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No visits yet</p>
          ) : (
            <div className="space-y-2">
              {recentVisits.map(v => (
                <Link key={v.id} to={`/client/visits/${v.id}`} className="flex items-center justify-between text-sm py-2 border-b last:border-0 hover:bg-muted/50 rounded px-2 -mx-2">
                  <span>{v.period_label || v.scheduled_date}</span>
                  <Badge variant="outline">{v.status.replace(/_/g, " ")}</Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
