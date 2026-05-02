import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Mail } from "lucide-react";

interface Prefs {
  cat_visits_enabled: boolean;
  cat_contracts_offers_enabled: boolean;
  cat_inspections_enabled: boolean;
}

const DEFAULTS: Prefs = {
  cat_visits_enabled: true,
  cat_contracts_offers_enabled: true,
  cat_inspections_enabled: true,
};

export default function EmailPreferencesCard() {
  const { user, profile } = useAuth();
  const email = (profile?.email || user?.email || "").toLowerCase();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!email) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("user_email_preferences" as any)
        .select("cat_visits_enabled, cat_contracts_offers_enabled, cat_inspections_enabled")
        .eq("email", email)
        .maybeSingle();
      if (data) setPrefs({ ...DEFAULTS, ...(data as any) });
      setLoading(false);
    })();
  }, [email]);

  const update = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!email) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_email_preferences" as any)
      .upsert(
        {
          email,
          cat_visits_enabled: prefs.cat_visits_enabled,
          cat_contracts_offers_enabled: prefs.cat_contracts_offers_enabled,
          cat_inspections_enabled: prefs.cat_inspections_enabled,
        } as any,
        { onConflict: "email" }
      );
    setSaving(false);
    if (error) {
      toast.error("Failed to save preferences");
      console.error(error);
    } else {
      toast.success("Email preferences updated");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle>Email Preferences</CardTitle>
          </div>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle>Email Preferences</CardTitle>
        </div>
        <CardDescription>
          Choose which emails you'd like to receive at <span className="font-medium">{email}</span>.
          Account &amp; security emails (like password resets) are always sent.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <PrefRow
          label="Visits"
          description="Reports and reminders for your scheduled visits"
          checked={prefs.cat_visits_enabled}
          onChange={(v) => update("cat_visits_enabled", v)}
        />
        <PrefRow
          label="Contracts & Offers"
          description="New offers, signed contracts, status updates"
          checked={prefs.cat_contracts_offers_enabled}
          onChange={(v) => update("cat_contracts_offers_enabled", v)}
        />
        <PrefRow
          label="Inspections"
          description="Inspection scheduling and reports"
          checked={prefs.cat_inspections_enabled}
          onChange={(v) => update("cat_inspections_enabled", v)}
        />
        <div className="pt-2">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Preferences"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PrefRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between rounded-md border bg-card p-3">
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}