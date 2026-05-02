import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  User, Phone, Mail, Hash, Pencil, Save, X, Building2, HelpCircle, MapPin,
} from "lucide-react";
import ChangePasswordCard from "@/components/ChangePasswordCard";
import EmailPreferencesCard from "@/components/EmailPreferencesCard";

type ClientType = "individual" | "company";

export default function ClientProfile() {
  const { user, profile, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [clientType, setClientType] = useState<ClientType>("individual");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [cnp, setCnp] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [cui, setCui] = useState("");
  const [vatId, setVatId] = useState("");
  const [addressCounty, setAddressCounty] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [fiscalRepresentative, setFiscalRepresentative] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});

  const startEditing = () => {
    setClientType((profile?.client_type as ClientType) || "individual");
    setFullName(profile?.full_name || "");
    setPhone(profile?.phone || "");
    setCnp(profile?.cnp || "");
    setCompanyName(profile?.company_name || "");
    setCui(profile?.cui || "");
    setVatId(profile?.vat_id || "");
    setAddressCounty(profile?.address_county || "");
    setAddressCity(profile?.address_city || "");
    setAddressStreet(profile?.address_street || "");
    setAddressNumber(profile?.address_number || "");
    setFiscalRepresentative(profile?.fiscal_representative || "");
    setErrors({});
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setErrors({});
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};

    if (clientType === "individual") {
      if (!fullName.trim()) e.fullName = "Full name is required";
      if (!cnp.trim()) e.cnp = "CNP is required for invoicing";
      else if (!/^\d{13}$/.test(cnp.trim())) e.cnp = "CNP must be exactly 13 digits";
    } else {
      if (!companyName.trim()) e.companyName = "Company name is required";
      if (!cui.trim()) e.cui = "CUI is required for B2B invoicing";
      if (!vatId.trim()) e.vatId = "VAT ID is required (e.g. RO12345678)";
      else if (!/^RO\d{2,10}$/i.test(vatId.trim())) e.vatId = "VAT ID must start with RO followed by 2-10 digits";
    }

    if (!addressCounty.trim()) e.addressCounty = "County / sector is required";
    if (!addressCity.trim()) e.addressCity = "City is required";
    if (!addressStreet.trim()) e.addressStreet = "Street is required";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!user) return;
    if (!validate()) return;

    setSaving(true);
    const payload: Record<string, unknown> = {
      client_type: clientType,
      full_name: fullName.trim() || null,
      phone: phone.trim() || null,
      cnp: cnp.trim() || null,
      company_name: clientType === "company" ? companyName.trim() || null : null,
      cui: clientType === "company" ? cui.trim() || null : null,
      vat_id: vatId.trim() || null,
      address_county: addressCounty.trim() || null,
      address_city: addressCity.trim() || null,
      address_street: addressStreet.trim() || null,
      address_number: addressNumber.trim() || null,
      fiscal_representative: clientType === "company" ? fiscalRepresentative.trim() || null : null,
    };

    const { error } = await supabase
      .from("profiles")
      .update(payload)
      .eq("user_id", user.id);

    if (error) {
      toast.error("Failed to update profile");
    } else {
      toast.success("Profile updated!");
      await refreshProfile();
      setEditing(false);
    }
    setSaving(false);
  };

  const isCompany = editing ? clientType === "company" : profile?.client_type === "company";
  const isIndividual = !isCompany;

  const FieldTip = ({ tip }: { tip: string }) => (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs">{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const FieldError = ({ field }: { field: string }) =>
    errors[field] ? <p className="text-xs text-destructive mt-0.5">{errors[field]}</p> : null;

  const ReadOnlyField = ({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string | null | undefined }) => (
    <div className="space-y-1">
      <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <Icon className="h-3.5 w-3.5" /> {label}
      </Label>
      <p className="text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">My Profile</h1>

      {/* Type Toggle */}
      <Card className="mb-4">
        <CardContent className="pt-5 pb-4">
          <Label className="text-xs text-muted-foreground mb-2 block">Account type</Label>
          {editing ? (
            <div className="flex gap-2">
              {(["individual", "company"] as const).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={clientType === t ? "default" : "outline"}
                  onClick={() => { setClientType(t); setErrors({}); }}
                  className="flex-1 capitalize"
                >
                  {t === "individual" ? <User className="h-4 w-4 mr-1.5" /> : <Building2 className="h-4 w-4 mr-1.5" />}
                  {t === "individual" ? "Individual / PFA" : "Company"}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm font-medium text-foreground capitalize flex items-center gap-1.5">
              {isCompany ? <Building2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
              {isCompany ? "Company" : "Individual / PFA"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Main Info */}
      <Card className="mb-4">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">{isCompany ? "Company Details" : "Personal Details"}</CardTitle>
          {!editing && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Individual: Full Name */}
          {isIndividual && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <User className="h-3.5 w-3.5" /> Full Name
                <FieldTip tip="Legal name as it appears on your ID. Used on invoices and contracts." />
              </Label>
              {editing ? (
                <>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Ion Popescu" />
                  <FieldError field="fullName" />
                </>
              ) : (
                <p className="text-sm font-medium text-foreground">{profile?.full_name || "—"}</p>
              )}
            </div>
          )}

          {/* Individual: CNP */}
          {isIndividual && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <Hash className="h-3.5 w-3.5" /> CNP
                <FieldTip tip="Personal Numeric Code (13 digits). Required by Romanian tax law for B2C/B2P invoices." />
              </Label>
              {editing ? (
                <>
                  <Input value={cnp} onChange={(e) => setCnp(e.target.value.replace(/\D/g, "").slice(0, 13))} placeholder="1234567890123" inputMode="numeric" />
                  <FieldError field="cnp" />
                </>
              ) : (
                <p className="text-sm font-mono font-medium text-foreground">{profile?.cnp || "—"}</p>
              )}
            </div>
          )}

          {/* Individual: Optional VAT ID */}
          {isIndividual && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <Hash className="h-3.5 w-3.5" /> VAT ID <span className="text-muted-foreground/60">(optional)</span>
                <FieldTip tip="Only if you're a VAT-registered PFA. Format: RO + digits." />
              </Label>
              {editing ? (
                <Input value={vatId} onChange={(e) => setVatId(e.target.value)} placeholder="RO12345678" />
              ) : (
                <p className="text-sm font-mono font-medium text-foreground">{profile?.vat_id || "—"}</p>
              )}
            </div>
          )}

          {/* Company: Company Name */}
          {isCompany && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <Building2 className="h-3.5 w-3.5" /> Company Name
                <FieldTip tip="Official registered company name. Used on all B2B invoices." />
              </Label>
              {editing ? (
                <>
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. SC GreenGrass SRL" />
                  <FieldError field="companyName" />
                </>
              ) : (
                <p className="text-sm font-medium text-foreground">{profile?.company_name || "—"}</p>
              )}
            </div>
          )}

          {/* Company: CUI */}
          {isCompany && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <Hash className="h-3.5 w-3.5" /> CUI
                <FieldTip tip="Company registration code (Cod Unic de Înregistrare). Required for e-Factura." />
              </Label>
              {editing ? (
                <>
                  <Input value={cui} onChange={(e) => setCui(e.target.value)} placeholder="e.g. 12345678" />
                  <FieldError field="cui" />
                </>
              ) : (
                <p className="text-sm font-mono font-medium text-foreground">{profile?.cui || "—"}</p>
              )}
            </div>
          )}

          {/* Company: VAT ID */}
          {isCompany && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <Hash className="h-3.5 w-3.5" /> VAT ID
                <FieldTip tip="Romanian VAT number (RO + CUI). Required for e-Factura RO_CIUS compliance." />
              </Label>
              {editing ? (
                <>
                  <Input value={vatId} onChange={(e) => setVatId(e.target.value)} placeholder="RO12345678" />
                  <FieldError field="vatId" />
                </>
              ) : (
                <p className="text-sm font-mono font-medium text-foreground">{profile?.vat_id || "—"}</p>
              )}
            </div>
          )}

          {/* Company: Contact Person */}
          {isCompany && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <User className="h-3.5 w-3.5" /> Contact Person
              </Label>
              {editing ? (
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Contact person name" />
              ) : (
                <p className="text-sm font-medium text-foreground">{profile?.full_name || "—"}</p>
              )}
            </div>
          )}

          {/* Phone */}
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Phone className="h-3.5 w-3.5" /> Phone
            </Label>
            {editing ? (
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+40 7xx xxx xxx" type="tel" />
            ) : (
              <p className="text-sm font-medium text-foreground">{profile?.phone || "—"}</p>
            )}
          </div>

          {/* Email (read-only) */}
          <ReadOnlyField icon={Mail} label="Email" value={profile?.email} />

          {/* Unique Client Number (read-only) */}
          <div className="space-y-1">
            <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Hash className="h-3.5 w-3.5" /> Client ID
            </Label>
            <p className="text-sm font-mono font-semibold text-foreground">{profile?.unique_client_id || "—"}</p>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-1.5">
            <MapPin className="h-4 w-4" /> {isCompany ? "Registered Address" : "Address"}
            {!editing && (
              <span className="ml-auto">
                <Button variant="outline" size="sm" onClick={startEditing}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit
                </Button>
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                County / Sector
                <FieldTip tip="Required for legal address on invoices and contracts." />
              </Label>
              {editing ? (
                <>
                  <Input value={addressCounty} onChange={(e) => setAddressCounty(e.target.value)} placeholder="e.g. Sector 1" />
                  <FieldError field="addressCounty" />
                </>
              ) : (
                <p className="text-sm font-medium text-foreground">{profile?.address_county || "—"}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                City
                <FieldTip tip="Locality name for the invoice address." />
              </Label>
              {editing ? (
                <>
                  <Input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} placeholder="e.g. București" />
                  <FieldError field="addressCity" />
                </>
              ) : (
                <p className="text-sm font-medium text-foreground">{profile?.address_city || "—"}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                Street
                <FieldTip tip="Street name for legal invoicing address." />
              </Label>
              {editing ? (
                <>
                  <Input value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} placeholder="e.g. Str. Florilor" />
                  <FieldError field="addressStreet" />
                </>
              ) : (
                <p className="text-sm font-medium text-foreground">{profile?.address_street || "—"}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nr.</Label>
              {editing ? (
                <Input value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} placeholder="12A" />
              ) : (
                <p className="text-sm font-medium text-foreground">{profile?.address_number || "—"}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fiscal Representative (Company only) */}
      {isCompany && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-1.5">
              Fiscal Representative <span className="text-muted-foreground/60 text-xs font-normal">(optional)</span>
              <FieldTip tip="Only needed for non-resident companies. Fiscal representative details for Romanian tax compliance." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editing ? (
              <Input value={fiscalRepresentative} onChange={(e) => setFiscalRepresentative(e.target.value)} placeholder="Name and fiscal code of representative" />
            ) : (
              <p className="text-sm font-medium text-foreground">{profile?.fiscal_representative || "—"}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Save / Cancel */}
      {editing && (
        <div className="flex gap-2 pb-8">
          <Button onClick={handleSave} disabled={saving} className="gap-1 flex-1">
            <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Profile"}
          </Button>
          <Button variant="outline" onClick={cancelEditing} disabled={saving}>
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
        </div>
      )}

      {/* Change Password */}
      {!editing && <ChangePasswordCard />}

      {/* Email Preferences */}
      {!editing && <EmailPreferencesCard />}

      {!editing && (
        <div className="mt-4">
          <Link
            to="/client/emails"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            <Mail className="h-4 w-4" /> View email history
          </Link>
        </div>
      )}
    </div>
  );
}
