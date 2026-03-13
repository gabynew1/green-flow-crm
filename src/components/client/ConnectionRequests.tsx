import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Check, X } from "lucide-react";
import { toast } from "sonner";

interface ConnectionRequest {
  id: string;
  provider_name: string | null;
  status: string;
  requested_at: string;
  tenant_id: string;
}

export function ConnectionRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);

  useEffect(() => {
    if (user) loadRequests();
  }, [user]);

  const loadRequests = async () => {
    const { data } = await supabase
      .from("client_connections")
      .select("*")
      .eq("client_user_id", user!.id)
      .eq("status", "PENDING");
    setRequests((data as any[]) ?? []);
  };

  const respond = async (id: string, status: "APPROVED" | "DENIED", tenantId: string) => {
    if (status === "APPROVED") {
      // Create a customer record under the tenant, link profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, email, phone")
        .eq("user_id", user!.id)
        .single();

      const { data: customer, error: custErr } = await supabase
        .from("customers")
        .insert({
          name: profile?.full_name || "Client",
          email: profile?.email,
          phone: profile?.phone,
          tenant_id: tenantId,
        })
        .select("id")
        .single();

      if (custErr) {
        toast.error("Failed to create customer link");
        return;
      }

      await supabase
        .from("profiles")
        .update({ customer_id: customer!.id })
        .eq("user_id", user!.id);
    }

    const { error } = await supabase
      .from("client_connections")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(status === "APPROVED" ? "Connection approved!" : "Connection denied");
    loadRequests();
  };

  if (requests.length === 0) return null;

  return (
    <div className="space-y-3 mb-6">
      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <UserPlus className="h-4 w-4" /> Connection Requests
      </h3>
      {requests.map((r) => (
        <Card key={r.id} className="border-primary/30">
          <CardContent className="pt-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{r.provider_name || "A service provider"} wants to connect with you</p>
              <p className="text-xs text-muted-foreground">
                Requested {new Date(r.requested_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" onClick={() => respond(r.id, "APPROVED", r.tenant_id)}>
                <Check className="h-4 w-4 mr-1" /> Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => respond(r.id, "DENIED", r.tenant_id)}>
                <X className="h-4 w-4 mr-1" /> Deny
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
