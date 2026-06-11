import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface LockedInfo {
  kind: "tenant" | "client";
  name: string;
  status: string;
  scheduled_delete_at: string | null;
}

export default function AccountLocked() {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<LockedInfo | null>(null);

  useEffect(() => {
    (async () => {
      if (profile?.tenant_id) {
        const { data } = await supabase.from("tenants")
          .select("name,status,scheduled_delete_at").eq("id", profile.tenant_id).maybeSingle();
        if (data) setInfo({ kind: "tenant", name: data.name, status: data.status, scheduled_delete_at: data.scheduled_delete_at });
      } else if (profile?.customer_id) {
        const { data } = await supabase.from("customers")
          .select("name,status,scheduled_delete_at").eq("id", profile.customer_id).maybeSingle();
        if (data) setInfo({ kind: "client", name: data.name, status: data.status, scheduled_delete_at: data.scheduled_delete_at });
      }
    })();
  }, [profile]);

  const daysLeft = info?.scheduled_delete_at
    ? Math.max(0, Math.ceil((new Date(info.scheduled_delete_at).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-background">
      <div className="max-w-lg w-full rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground mb-2">Account locked</h1>
        <p className="text-muted-foreground mb-4">
          {info?.kind === "client" ? "Your client account " : "Your workspace "}
          {info?.name && <strong>{info.name}</strong>} has been locked due to inactivity or by an administrator.
        </p>
        {daysLeft !== null && (
          <div className="rounded-lg bg-muted p-4 mb-4 text-sm">
            <strong className="text-foreground">{daysLeft} days</strong> remain before permanent deletion.
            All data is preserved until then.
          </div>
        )}
        <p className="text-sm text-muted-foreground mb-6">
          To reactivate, please contact your administrator. If you're the account owner, signing in again will automatically restore access.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={async () => { await signOut(); navigate("/auth"); }}>Sign out</Button>
          <Button onClick={() => window.location.reload()}>Refresh</Button>
        </div>
      </div>
    </div>
  );
}