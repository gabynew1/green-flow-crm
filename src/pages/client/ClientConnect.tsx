import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link2, MapPin, Check, ArrowLeft, Search } from "lucide-react";
import { toast } from "sonner";
import { createActionTask } from "@/hooks/useActionTasks";

interface Property {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  tenant_id: string | null;
  connectedProviderName?: string;
}

export default function ClientConnect() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const providerCode = searchParams.get("provider") || "";
  const [manualCode, setManualCode] = useState(providerCode);
  const [resolvedCode, setResolvedCode] = useState(providerCode);

  const [providerName, setProviderName] = useState<string | null>(null);
  const [providerTenantId, setProviderTenantId] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProps, setLoadingProps] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState(false);

  // Lookup provider on mount if code present
  useEffect(() => {
    if (resolvedCode) lookupProvider(resolvedCode);
  }, []);

  const lookupProvider = async (code: string) => {
    if (!code.trim()) return;
    setLookingUp(true);
    setLookupError(null);
    setProviderName(null);
    setProviderTenantId(null);

    const { data, error } = await supabase
      .rpc("lookup_tenant_by_code", { _code: code.trim().toUpperCase() });

    if (error || !data || data.length === 0) {
      setLookupError("No provider found with that ID. Please check and try again.");
      setLookingUp(false);
      return;
    }

    setProviderName(data[0].name);
    setProviderTenantId(data[0].id);
    setResolvedCode(data[0].unique_tenant_id!);
    setLookingUp(false);
    setLookingUp(false);

    // Load properties
    loadProperties(data[0].id);
  };

  const loadProperties = async (tenantId: string) => {
    setLoadingProps(true);
    const { data: props } = await supabase
      .from("properties")
      .select("id, name, address, city, tenant_id")
      .order("name");

    if (!props) {
      setLoadingProps(false);
      return;
    }

    // For connected properties, fetch provider names
    const connectedTenantIds = [...new Set(props.filter(p => p.tenant_id && p.tenant_id !== tenantId).map(p => p.tenant_id!))];
    let tenantNames: Record<string, string> = {};
    if (connectedTenantIds.length > 0) {
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id, name")
        .in("id", connectedTenantIds);
      if (tenants) {
        tenants.forEach(t => { tenantNames[t.id] = t.name; });
      }
    }

    const mapped: Property[] = props.map(p => ({
      ...p,
      connectedProviderName: p.tenant_id
        ? (p.tenant_id === tenantId ? "This provider" : tenantNames[p.tenant_id] || "Another provider")
        : undefined,
    }));

    setProperties(mapped);
    setLoadingProps(false);
  };

  const toggleProperty = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const available = properties.filter(p => !p.tenant_id);
    if (selectedIds.size === available.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(available.map(p => p.id)));
    }
  };

  const handleConnect = async () => {
    if (!providerTenantId || selectedIds.size === 0) return;
    setConnecting(true);

    const ids = Array.from(selectedIds);
    try {
      await createActionTask({
        task_type: "link_request",
        tenant_id: providerTenantId,
        target_role: "PROVIDER_ADMIN",
        subject_entity_type: "tenant",
        subject_entity_id: providerTenantId,
        payload: {
          property_ids: ids,
          provider_tenant_id: providerTenantId,
          provider_name: providerName,
        },
      });
      toast.success("Request sent — awaiting provider approval");
      navigate("/client/tasks");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send link request");
    } finally {
      setConnecting(false);
    }
  };

  const availableCount = properties.filter(p => !p.tenant_id).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/client")} className="gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </Button>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Link2 className="h-6 w-6 text-primary" />
          Connect to Provider
        </h1>
        <p className="text-muted-foreground mt-1">
          Enter your provider's Tenant ID to connect your properties.
        </p>
      </div>

      {/* Provider Lookup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provider ID</CardTitle>
          <CardDescription>Enter the unique Provider ID shared with you (e.g. GP-XXXXXX)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              placeholder="GP-XXXXXX"
              className="font-mono uppercase"
            />
            <Button
              onClick={() => lookupProvider(manualCode)}
              disabled={lookingUp || !manualCode.trim()}
            >
              <Search className="h-4 w-4 mr-1" />
              {lookingUp ? "Looking up…" : "Find"}
            </Button>
          </div>
          {lookupError && (
            <p className="text-sm text-destructive mt-2">{lookupError}</p>
          )}
          {providerName && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <Check className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Provider found: <strong>{providerName}</strong></span>
              <Badge variant="outline" className="ml-auto font-mono text-xs">{resolvedCode}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Property Selection */}
      {providerTenantId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Select Properties</CardTitle>
                <CardDescription>
                  Choose which properties to share with {providerName}
                </CardDescription>
              </div>
              {availableCount > 1 && (
                <Button variant="outline" size="sm" onClick={selectAll}>
                  {selectedIds.size === availableCount ? "Deselect All" : "Select All"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loadingProps ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : properties.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                You don't have any properties yet. Add a property from your dashboard first.
              </p>
            ) : (
              <div className="space-y-2">
                {properties.map(prop => {
                  const isConnected = !!prop.tenant_id;
                  const isSelected = selectedIds.has(prop.id);

                  return (
                    <label
                      key={prop.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors cursor-pointer ${
                        isConnected
                          ? "opacity-50 cursor-not-allowed bg-muted/30"
                          : isSelected
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => !isConnected && toggleProperty(prop.id)}
                        disabled={isConnected}
                      />
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{prop.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[prop.address, prop.city].filter(Boolean).join(", ") || "No address"}
                        </p>
                      </div>
                      {isConnected && (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          Connected to {prop.connectedProviderName}
                        </Badge>
                      )}
                    </label>
                  );
                })}
              </div>
            )}

            {availableCount > 0 && (
              <Button
                className="w-full mt-4"
                onClick={handleConnect}
                disabled={connecting || selectedIds.size === 0}
              >
                {connecting
                  ? "Connecting…"
                  : `Connect ${selectedIds.size} Propert${selectedIds.size !== 1 ? "ies" : "y"}`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
