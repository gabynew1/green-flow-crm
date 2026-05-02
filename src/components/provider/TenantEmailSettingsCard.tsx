import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Palette } from "lucide-react";

interface EmailSettings {
  from_name: string | null;
  reply_to: string | null;
  footer_html: string | null;
  logo_url: string | null;
  brand_color: string | null;
  locale: string;
  cat_account_enabled: boolean;
  cat_visits_enabled: boolean;
  cat_contracts_offers_enabled: boolean;
  cat_inspections_enabled: boolean;
}

const DEFAULTS: EmailSettings = {
  from_name: "",
  reply_to: "",
  footer_html: "",
  logo_url: "",
  brand_color: "#10b981",
  locale: "ro",
  cat_account_enabled: true,
  cat_visits_enabled: true,
  cat_contracts_offers_enabled: true,
  cat_inspections_enabled: true,
};

export default function TenantEmailSettingsCard() {
  const { tenantId } = useAuth();
  const [settings, setSettings] = useState<EmailSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("tenant_email_settings" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (!error && data) {
        setSettings({ ...DEFAULTS, ...(data as any) });
      }
      setLoading(false);
    })();
  }, [tenantId]);

  const update = <K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    const { error } = await supabase
      .from("tenant_email_settings" as any)
      .upsert(
        {
          tenant_id: tenantId,
          from_name: settings.from_name || null,
          reply_to: settings.reply_to || null,
          footer_html: settings.footer_html || null,
          logo_url: settings.logo_url || null,
          brand_color: settings.brand_color || "#10b981",
          locale: settings.locale,
          cat_account_enabled: settings.cat_account_enabled,
          cat_visits_enabled: settings.cat_visits_enabled,
          cat_contracts_offers_enabled: settings.cat_contracts_offers_enabled,
          cat_inspections_enabled: settings.cat_inspections_enabled,
        } as any,
        { onConflict: "tenant_id" }
      );
    setSaving(false);
    if (error) {
      toast.error("Failed to save email settings");
      console.error(error);
    } else {
      toast.success("Email settings updated");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <CardTitle>Email Settings</CardTitle>
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
          <CardTitle>Email Settings</CardTitle>
        </div>
        <CardDescription>
          Customize how emails sent from your workspace look and which categories are active.
          Account &amp; security emails are always required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Branding */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Palette className="h-4 w-4 text-muted-foreground" />
            Branding
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="from_name">From Name</Label>
              <Input
                id="from_name"
                value={settings.from_name ?? ""}
                onChange={(e) => update("from_name", e.target.value)}
                placeholder="Your Company"
              />
              <p className="text-xs text-muted-foreground">Shown as the sender in recipients' inboxes.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reply_to">Reply-To Email</Label>
              <Input
                id="reply_to"
                type="email"
                value={settings.reply_to ?? ""}
                onChange={(e) => update("reply_to", e.target.value)}
                placeholder="contact@yourcompany.com"
              />
              <p className="text-xs text-muted-foreground">When recipients hit Reply, this is where it goes.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo_url">Logo URL</Label>
              <Input
                id="logo_url"
                type="url"
                value={settings.logo_url ?? ""}
                onChange={(e) => update("logo_url", e.target.value)}
                placeholder="https://…/logo.png"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand_color">Brand Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="brand_color"
                  type="color"
                  value={settings.brand_color ?? "#10b981"}
                  onChange={(e) => update("brand_color", e.target.value)}
                  className="h-10 w-20 p-1"
                />
                <Input
                  value={settings.brand_color ?? "#10b981"}
                  onChange={(e) => update("brand_color", e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="locale">Email Language</Label>
              <Select value={settings.locale} onValueChange={(v) => update("locale", v)}>
                <SelectTrigger id="locale"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ro">Română</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="footer_html">Footer / Legal Block</Label>
            <Textarea
              id="footer_html"
              value={settings.footer_html ?? ""}
              onChange={(e) => update("footer_html", e.target.value)}
              placeholder="Your Company SRL · CUI: RO12345678 · Bucharest, Romania"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">Plain text or simple HTML. Appears above the unsubscribe link.</p>
          </div>
        </div>

        <Separator />

        {/* Category toggles */}
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium">Email Categories</div>
            <p className="text-xs text-muted-foreground">Disable a category to instantly stop those emails from your workspace. Recipients can still control non-required categories from their own preferences.</p>
          </div>
          <div className="space-y-3">
            <CategoryRow
              label="Account &amp; Security"
              description="Password resets, account changes, security alerts"
              required
              checked={settings.cat_account_enabled}
              onChange={(v) => update("cat_account_enabled", v)}
            />
            <CategoryRow
              label="Visits"
              description="Visit reports and reminders"
              checked={settings.cat_visits_enabled}
              onChange={(v) => update("cat_visits_enabled", v)}
            />
            <CategoryRow
              label="Contracts &amp; Offers"
              description="Contract and offer notifications, signatures, responses"
              checked={settings.cat_contracts_offers_enabled}
              onChange={(v) => update("cat_contracts_offers_enabled", v)}
            />
            <CategoryRow
              label="Inspections"
              description="Inspection scheduling, reports, and follow-ups"
              checked={settings.cat_inspections_enabled}
              onChange={(v) => update("cat_inspections_enabled", v)}
            />
          </div>
        </div>

        <div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Email Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryRow({
  label,
  description,
  checked,
  onChange,
  required,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
}) {
  return (
    <div className="flex items-start justify-between rounded-md border bg-card p-3">
      <div className="space-y-0.5">
        <div className="text-sm font-medium" dangerouslySetInnerHTML={{ __html: label }} />
        <div className="text-xs text-muted-foreground">{description}</div>
        {required && (
          <div className="text-[10px] uppercase tracking-wide text-amber-600 mt-1">
            Required — disabling stops password resets too
          </div>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}