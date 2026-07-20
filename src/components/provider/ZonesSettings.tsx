import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MapPin, Pencil, Plus, Trash2, Loader2 } from "lucide-react";

const SWATCHES = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#64748b"] as const;

export const safeColor = (c?: string | null) =>
  c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#10b981";

interface ZoneRow {
  id: string;
  name: string;
  color: string;
  description: string | null;
  properties: { count: number }[] | null;
}

export default function ZonesSettings() {
  const { tenantId, profile } = useAuth();
  const queryClient = useQueryClient();
  const canEdit = profile?.provider_permission === "full_admin";

  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ZoneRow | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("#10b981");
  const [description, setDescription] = useState<string>("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<ZoneRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("service_zones")
      .select("id, name, color, description, properties(count)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    if (!error) setZones((data ?? []) as unknown as ZoneRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const propCount = (z: ZoneRow) => z.properties?.[0]?.count ?? 0;

  const openCreate = () => {
    setEditing(null);
    setName("");
    setColor("#10b981");
    setDescription("");
    setNameError(null);
    setDialogOpen(true);
  };

  const openEdit = (z: ZoneRow) => {
    setEditing(z);
    setName(z.name);
    setColor(safeColor(z.color));
    setDescription(z.description ?? "");
    setNameError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!tenantId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError("Name is required");
      return;
    }
    setSaving(true);
    setNameError(null);
    const trimmedDesc = description.trim();
    const descValue = trimmedDesc.length > 0 ? trimmedDesc : null;
    const payload = { tenant_id: tenantId, name: trimmed, color: safeColor(color), description: descValue };
    const { error } = editing
      ? await supabase.from("service_zones").update({ name: trimmed, color: safeColor(color), description: descValue }).eq("id", editing.id)
      : await supabase.from("service_zones").insert(payload);
    setSaving(false);
    if (error) {
      if ((error as any).code === "23505") {
        setNameError("A zone with this name already exists.");
        return;
      }
      toast.error("Could not save zone: " + error.message);
      return;
    }
    setDialogOpen(false);
    toast.success(editing ? "Zone updated" : "Zone created");
    await load();
    queryClient.invalidateQueries({ queryKey: ["zones"] });
    queryClient.invalidateQueries({ queryKey: ["properties"] });
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("service_zones").delete().eq("id", pendingDelete.id);
    setDeleting(false);
    if (error) {
      toast.error("Could not delete zone: " + error.message);
      return;
    }
    toast.success("Zone deleted");
    setPendingDelete(null);
    await load();
    queryClient.invalidateQueries({ queryKey: ["zones"] });
    queryClient.invalidateQueries({ queryKey: ["properties"] });
    queryClient.invalidateQueries({ queryKey: ["property"] });
    queryClient.invalidateQueries({ queryKey: ["zone-date-map"] });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <CardTitle>Service Zones</CardTitle>
          </div>
          <Button size="sm" onClick={openCreate} disabled={!canEdit}>
            <Plus className="h-4 w-4 mr-1" /> New Zone
          </Button>
        </div>
        <CardDescription>
          Group properties into zones to cluster service visits on the same day for the same team.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
        ) : zones.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No zones yet. Create your first zone to start grouping properties.
          </div>
        ) : (
          <div className="divide-y">
            {zones.map((z) => {
              const count = propCount(z);
              const blocked = count > 0;
              return (
                <div key={z.id} className="flex items-center justify-between py-2.5 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="h-4 w-4 rounded-full shrink-0 border border-border"
                      style={{ backgroundColor: safeColor(z.color) }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{z.name}</span>
                        <Badge variant="secondary" className="text-[10px]">{count} properties</Badge>
                      </div>
                      {z.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-wrap">
                          {z.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(z)} disabled={!canEdit}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => !blocked && setPendingDelete(z)}
                              disabled={!canEdit || blocked}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {blocked && (
                          <TooltipContent>
                            {count} properties use this zone — reassign them first.
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Zone" : "New Zone"}</DialogTitle>
            <DialogDescription>Zones are visible only to your team.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="zone-name">Zone Name</Label>
              <Input
                id="zone-name"
                value={name}
                onChange={(e) => { setName(e.target.value); if (nameError) setNameError(null); }}
                placeholder="e.g. North City"
                aria-invalid={!!nameError}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zone-description">Description / addresses</Label>
              <Textarea
                id="zone-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="List streets or landmarks that belong to this zone"
                rows={4}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {SWATCHES.map((sw) => (
                  <button
                    key={sw}
                    type="button"
                    onClick={() => setColor(sw)}
                    className={`h-7 w-7 rounded-full border-2 transition ${color === sw ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: sw }}
                    aria-label={`Pick color ${sw}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this zone?</AlertDialogTitle>
            <AlertDialogDescription>
              The zone “{pendingDelete?.name}” will be removed. No properties will be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}