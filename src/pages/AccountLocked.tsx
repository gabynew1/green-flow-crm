import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

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
  const { t } = useTranslation("public");

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
    <div className="relative flex min-h-screen items-center justify-center p-6 bg-background">
      <div className="absolute top-3 right-3"><LanguageSwitcher /></div>
      <div className="max-w-lg w-full rounded-2xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground mb-2">{t("accountLocked.title")}</h1>
        <p className="text-muted-foreground mb-4">
          {info?.kind === "client" ? t("accountLocked.clientPrefix") : t("accountLocked.workspacePrefix")}
          {info?.name && <strong>{info.name}</strong>}{t("accountLocked.lockedSuffix")}
        </p>
        {daysLeft !== null && (
          <div className="rounded-lg bg-muted p-4 mb-4 text-sm">
            <strong className="text-foreground">{t("accountLocked.daysRemaining", { days: daysLeft })}</strong>{t("accountLocked.deletionInfo")}
          </div>
        )}
        <p className="text-sm text-muted-foreground mb-6">
          {t("accountLocked.contact")}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={async () => { await signOut(); navigate("/auth"); }}>{t("accountLocked.signOut")}</Button>
          <Button onClick={() => window.location.reload()}>{t("accountLocked.refresh")}</Button>
        </div>
      </div>
    </div>
  );
}