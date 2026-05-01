import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { actOnTask } from "@/hooks/useActionTasks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Link2, Package } from "lucide-react";
import { toast } from "sonner";

interface PropertyRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  tenant_id: string | null;
  tenants?: { name: string | null } | null;
  itemCount: number;
}

interface Props {
  taskId: string | null;
  tenantName?: string | null;
  onClose: () => void;
  onDone?: () => void;
}

export function ApproveLinkDialog({ taskId, tenantName, onClose, onDone }: Props) {
  const { user } = useAuth();
  const open = !!taskId;
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      setLoading(true);
      setSelected(new Set());

      const { data: props } = await supabase
        .from("properties")
        .select("id, name, address, city, tenant_id, tenants(name)")
        .order("name");

      const list = (props as any[]) ?? [];

      // Inventory item counts
      const ids = list.map((p) => p.id);
      const counts: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: inv } = await supabase
          .from("inventory")
          .select("id, property_id")
          .in("property_id", ids);
        const invByProp: Record<string, string[]> = {};
        (inv ?? []).forEach((i: any) => {
          invByProp[i.property_id] = invByProp[i.property_id] ?? [];
          invByProp[i.property_id].push(i.id);
        });
        const invIds = (inv ?? []).map((i: any) => i.id);
        if (invIds.length > 0) {
          const { data: items } = await supabase
            .from("inventory_items")
            .select("id, inventory_id")
            .in("inventory_id", invIds);
          const countByInv: Record<string, number> = {};
          (items ?? []).forEach((it: any) => {
            countByInv[it.inventory_id] = (countByInv[it.inventory_id] ?? 0) + 1;
          });
          for (const pid of ids) {
            counts[pid] = (invByProp[pid] ?? []).reduce(
              (acc, iid) => acc + (countByInv[iid] ?? 0),
              0
            );
          }
        }
      }

      setProperties(
        list.map((p) => ({
          id: p.id,
          name: p.name,
          address: p.address,
          city: p.city,
          tenant_id: p.tenant_id,
          tenants: p.tenants,
          itemCount: counts[p.id] ?? 0,
        }))
      );
      setLoading(false);
    })();
  }, [open, user]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const available = properties.filter((p) => !p.tenant_id);
  const allSelected = available.length > 0 && available.every((p) => selected.has(p.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(available.map((p) => p.id)));
  };

  const submit = async (action: "approve" | "reject") => {
    if (!taskId) return;
    if (action === "approve" && selected.size === 0) {
      toast.error("Select at least one property to share");
      return;
    }
    setSubmitting(true);
    try {
      await actOnTask(
        taskId,
        action,
        action === "reject" ? "Connection request denied" : undefined,
        action === "approve" ? { property_ids: Array.from(selected) } : undefined
      );
      toast.success(
        action === "approve"
          ? `Shared ${selected.size} property(ies) with ${tenantName ?? "the provider"}`
          : "Request denied"
      );
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            Share properties with {tenantName ?? "provider"}
          </DialogTitle>
          <DialogDescription>
            Pick the properties (with their address and current inventory) to share. The provider
            will be able to schedule inspections, send offers and contracts for the selected
            properties.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {available.length} available · {properties.length - available.length} already linked
            </p>
            {available.length > 1 && (
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {allSelected ? "Deselect all" : "Select all"}
              </Button>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : properties.length === 0 ? (
            <p className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              You don't have any properties yet.
            </p>
          ) : (
            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {properties.map((p) => {
                const isLinked = !!p.tenant_id;
                const isChecked = selected.has(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                      isLinked
                        ? "cursor-not-allowed bg-muted/30 opacity-60"
                        : isChecked
                        ? "cursor-pointer border-primary bg-primary/5"
                        : "cursor-pointer hover:bg-muted/50"
                    }`}
                  >
                    <Checkbox
                      checked={isChecked}
                      disabled={isLinked}
                      onCheckedChange={() => !isLinked && toggle(p.id)}
                    />
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[p.address, p.city].filter(Boolean).join(", ") || "No address"}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Package className="h-3 w-3" /> {p.itemCount} inventory item
                        {p.itemCount === 1 ? "" : "s"} will be shared
                      </p>
                    </div>
                    {isLinked && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        Linked to {p.tenants?.name ?? "provider"}
                      </Badge>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => submit("reject")} disabled={submitting}>
            Deny
          </Button>
          <Button
            onClick={() => submit("approve")}
            disabled={submitting || selected.size === 0}
          >
            {submitting ? "Sharing…" : `Approve & share (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}