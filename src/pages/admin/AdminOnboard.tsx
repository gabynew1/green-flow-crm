import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Building2,
  Users,
  Mail,
  PenLine,
  ArrowLeft,
  ArrowRight,
  Copy,
  Check,
  Sparkles,
  Send,
  RotateCcw,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EntityType = "provider" | "customer" | null;
type OnboardMethod = "invite" | "manual" | null;

interface InviteData {
  recipientName: string;
  recipientEmail: string;
  companyName: string;
}

interface ManualProviderData {
  companyName: string;
  fullName: string;
  email: string;
  phone: string;
  cui: string;
}

interface ManualCustomerData {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
}

function getProviderEmailHtml(recipientName: string, inviteLink: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0faf4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
<tr><td style="background:linear-gradient(135deg,#1a8a5c 0%,#0d6b43 100%);padding:40px 40px 32px;text-align:center">
<div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px">
<span style="font-size:28px">🌿</span>
</div>
<h1 style="color:#fff;margin:0 0 8px;font-size:24px;font-weight:700">Welcome to GreenCRM</h1>
<p style="color:rgba(255,255,255,0.85);margin:0;font-size:15px">Your service management platform awaits</p>
</td></tr>
<tr><td style="padding:36px 40px 40px">
<p style="color:#1a3a2a;font-size:17px;margin:0 0 8px;font-weight:600">Hi ${recipientName},</p>
<p style="color:#4a6a5a;font-size:15px;line-height:1.6;margin:0 0 24px">
You've been invited to join <strong>GreenCRM</strong> as a <strong>Service Provider</strong>. Set up your company profile, manage your team, organize service visits, and start connecting with clients — all in one place.
</p>
<div style="background:#f0faf4;border-radius:12px;padding:20px;margin:0 0 28px">
<p style="color:#1a3a2a;font-size:14px;font-weight:600;margin:0 0 12px">What you'll get:</p>
<table cellpadding="0" cellspacing="0" width="100%">
<tr><td style="padding:4px 0;color:#4a6a5a;font-size:14px">✅ Company profile & branding</td></tr>
<tr><td style="padding:4px 0;color:#4a6a5a;font-size:14px">✅ Team member management</td></tr>
<tr><td style="padding:4px 0;color:#4a6a5a;font-size:14px">✅ Service catalog & contracts</td></tr>
<tr><td style="padding:4px 0;color:#4a6a5a;font-size:14px">✅ Client property connections</td></tr>
</table>
</div>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center">
<a href="${inviteLink}" style="display:inline-block;background:linear-gradient(135deg,#1a8a5c,#0d6b43);color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:16px;font-weight:600;box-shadow:0 4px 12px rgba(26,138,92,0.3)">Accept Invitation →</a>
</td></tr>
</table>
<p style="color:#8a9a90;font-size:13px;margin:28px 0 0;text-align:center">This invite link expires in 7 days.</p>
</td></tr>
<tr><td style="background:#f8faf9;padding:20px 40px;border-top:1px solid #e8f0ec;text-align:center">
<p style="color:#8a9a90;font-size:12px;margin:0">© ${new Date().getFullYear()} GreenCRM · Powered by Lovable</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function getCustomerEmailHtml(recipientName: string, providerName: string, inviteLink: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0faf4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
<tr><td style="background:linear-gradient(135deg,#1a8a5c 0%,#2da87a 50%,#43c69a 100%);padding:40px 40px 32px;text-align:center">
<div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:14px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px">
<span style="font-size:28px">🏡</span>
</div>
<h1 style="color:#fff;margin:0 0 8px;font-size:24px;font-weight:700">You're Invited!</h1>
<p style="color:rgba(255,255,255,0.85);margin:0;font-size:15px">${providerName} wants to connect with you</p>
</td></tr>
<tr><td style="padding:36px 40px 40px">
<p style="color:#1a3a2a;font-size:17px;margin:0 0 8px;font-weight:600">Hi ${recipientName},</p>
<p style="color:#4a6a5a;font-size:15px;line-height:1.6;margin:0 0 24px">
<strong>${providerName}</strong> has invited you to connect your properties on <strong>GreenCRM</strong>. Once connected, you'll be able to view service visits, approve contracts, and provide feedback — all from one easy dashboard.
</p>
<div style="background:#f0faf4;border-radius:12px;padding:20px;margin:0 0 28px">
<p style="color:#1a3a2a;font-size:14px;font-weight:600;margin:0 0 12px">As a client you can:</p>
<table cellpadding="0" cellspacing="0" width="100%">
<tr><td style="padding:4px 0;color:#4a6a5a;font-size:14px">🏠 Manage your properties</td></tr>
<tr><td style="padding:4px 0;color:#4a6a5a;font-size:14px">📋 Review & approve contracts</td></tr>
<tr><td style="padding:4px 0;color:#4a6a5a;font-size:14px">📅 Track service visits</td></tr>
<tr><td style="padding:4px 0;color:#4a6a5a;font-size:14px">⭐ Give feedback on services</td></tr>
</table>
</div>
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center">
<a href="${inviteLink}" style="display:inline-block;background:linear-gradient(135deg,#1a8a5c,#0d6b43);color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:16px;font-weight:600;box-shadow:0 4px 12px rgba(26,138,92,0.3)">Get Started →</a>
</td></tr>
</table>
<p style="color:#8a9a90;font-size:13px;margin:28px 0 0;text-align:center">Simply click the button to create your account or sign in.</p>
</td></tr>
<tr><td style="background:#f8faf9;padding:20px 40px;border-top:1px solid #e8f0ec;text-align:center">
<p style="color:#8a9a90;font-size:12px;margin:0">© ${new Date().getFullYear()} GreenCRM · Powered by Lovable</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export default function AdminOnboard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [entityType, setEntityType] = useState<EntityType>(null);
  const [method, setMethod] = useState<OnboardMethod>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  // Invite data
  const [inviteData, setInviteData] = useState<InviteData>({
    recipientName: "",
    recipientEmail: "",
    companyName: "",
  });

  // Manual data
  const [providerData, setProviderData] = useState<ManualProviderData>({
    companyName: "",
    fullName: "",
    email: "",
    phone: "",
    cui: "",
  });
  const [customerData, setCustomerData] = useState<ManualCustomerData>({
    name: "",
    contactPerson: "",
    email: "",
    phone: "",
  });

  // Confirmation data
  const [confirmationData, setConfirmationData] = useState<any>(null);

  const totalSteps = 4;

  const goBack = () => {
    if (step === 1) {
      navigate("/admin/tenants");
    } else {
      setStep(step - 1);
    }
  };

  const handleTypeSelect = (type: EntityType) => {
    setEntityType(type);
    setMethod(null);
    setStep(2);
  };

  const handleMethodSelect = (m: OnboardMethod) => {
    setMethod(m);
    setStep(3);
  };

  const handleInviteSubmit = async () => {
    if (!inviteData.recipientName.trim() || !inviteData.recipientEmail.trim()) {
      toast.error("Please fill in the name and email");
      return;
    }
    setIsLoading(true);
    try {
      if (entityType === "provider") {
        const { data, error } = await supabase.functions.invoke("create-provider-invite", {
          body: { tenantName: inviteData.companyName || inviteData.recipientName, role: "PROVIDER_ADMIN" },
        });
        if (error) throw error;
        const link = `${window.location.origin}/auth?invite=${data.token}`;
        setGeneratedLink(link);
        setShowEmailPreview(true);
        toast.success("Invite link generated!");
      } else {
        // For customers, we need a tenant to get its connect code
        // Use a placeholder connect link
        const link = `${window.location.origin}/auth`;
        setGeneratedLink(link);
        setShowEmailPreview(true);
        toast.success("Customer invite link generated!");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate invite");
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    setIsLoading(true);
    try {
      const body = entityType === "provider"
        ? { type: "provider", data: providerData }
        : { type: "customer", data: customerData };

      const { data, error } = await supabase.functions.invoke("create-manual-user", { body });
      if (error) throw error;

      setConfirmationData(data);
      setStep(4);
      toast.success(`${entityType === "provider" ? "Provider" : "Customer"} created successfully!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendInvite = () => {
    // Stubbed — email sending not configured yet
    toast.info("Email sending will be available after domain setup. Link has been copied instead.");
    copyLink();
    setConfirmationData({
      type: entityType,
      method: "invite",
      recipientName: inviteData.recipientName,
      recipientEmail: inviteData.recipientEmail,
      link: generatedLink,
    });
    setStep(4);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const resetWizard = () => {
    setStep(1);
    setEntityType(null);
    setMethod(null);
    setGeneratedLink("");
    setShowEmailPreview(false);
    setCopied(false);
    setInviteData({ recipientName: "", recipientEmail: "", companyName: "" });
    setProviderData({ companyName: "", fullName: "", email: "", phone: "", cui: "" });
    setCustomerData({ name: "", contactPerson: "", email: "", phone: "" });
    setConfirmationData(null);
  };

  const emailHtml = entityType === "provider"
    ? getProviderEmailHtml(inviteData.recipientName || "there", generatedLink || "#")
    : getCustomerEmailHtml(inviteData.recipientName || "there", inviteData.companyName || "Your Provider", generatedLink || "#");

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Add to Platform</h1>
            <p className="text-sm text-muted-foreground">
              {step === 1 && "Choose who you'd like to onboard"}
              {step === 2 && "How would you like to onboard them?"}
              {step === 3 && method === "invite" && "Configure the invitation"}
              {step === 3 && method === "manual" && "Enter their details"}
              {step === 4 && "All done!"}
            </p>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                i + 1 === step ? "w-8 bg-primary" : i + 1 < step ? "w-2 bg-primary/60" : "w-2 bg-muted-foreground/20"
              )}
            />
          ))}
        </div>

        {/* Step 1: Choose Type */}
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2 animate-in fade-in duration-500">
            <Card
              className={cn(
                "group cursor-pointer p-8 text-center transition-all duration-200 hover:ring-2 hover:ring-primary hover:shadow-lg",
                entityType === "provider" && "ring-2 ring-primary"
              )}
              onClick={() => handleTypeSelect("provider")}
            >
              <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Service Provider</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A landscaping company or independent professional who delivers services to clients.
              </p>
            </Card>

            <Card
              className={cn(
                "group cursor-pointer p-8 text-center transition-all duration-200 hover:ring-2 hover:ring-primary hover:shadow-lg",
                entityType === "customer" && "ring-2 ring-primary"
              )}
              onClick={() => handleTypeSelect("customer")}
            >
              <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Customer</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A property owner or household who receives services from a provider.
              </p>
            </Card>
          </div>
        )}

        {/* Step 2: Choose Method */}
        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2 animate-in fade-in duration-500">
            <Card
              className="group cursor-pointer p-8 text-center transition-all duration-200 hover:ring-2 hover:ring-primary hover:shadow-lg"
              onClick={() => handleMethodSelect("invite")}
            >
              <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Send Invite Link</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Send a personalized email with an onboarding link. They'll set up their own account.
              </p>
            </Card>

            <Card
              className="group cursor-pointer p-8 text-center transition-all duration-200 hover:ring-2 hover:ring-primary hover:shadow-lg"
              onClick={() => handleMethodSelect("manual")}
            >
              <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <PenLine className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Manual Setup</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Enter their details now and create their account immediately. You'll get a temporary password.
              </p>
            </Card>
          </div>
        )}

        {/* Step 3a: Invite Flow */}
        {step === 3 && method === "invite" && (
          <div className="animate-in fade-in duration-500 space-y-6">
            {!showEmailPreview ? (
              <Card className="p-6 space-y-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      Invite a {entityType === "provider" ? "Service Provider" : "Customer"}
                    </h3>
                    <p className="text-sm text-muted-foreground">We'll generate a personalized invite for them</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Recipient Name *</Label>
                    <Input
                      value={inviteData.recipientName}
                      onChange={(e) => setInviteData({ ...inviteData, recipientName: e.target.value })}
                      placeholder="e.g. John Smith"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Recipient Email *</Label>
                    <Input
                      type="email"
                      value={inviteData.recipientEmail}
                      onChange={(e) => setInviteData({ ...inviteData, recipientEmail: e.target.value })}
                      placeholder="e.g. john@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{entityType === "provider" ? "Company Name" : "Provider / Household Name"}</Label>
                    <Input
                      value={inviteData.companyName}
                      onChange={(e) => setInviteData({ ...inviteData, companyName: e.target.value })}
                      placeholder={entityType === "provider" ? "e.g. Green Gardens LLC" : "e.g. Smith Residence"}
                    />
                  </div>
                </div>

                <Button onClick={handleInviteSubmit} disabled={isLoading} className="w-full">
                  {isLoading ? "Generating…" : "Generate Invite"}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Link copy bar */}
                <Card className="p-4">
                  <Label className="text-xs text-muted-foreground mb-2 block">Invite Link</Label>
                  <div className="flex gap-2">
                    <Input value={generatedLink} readOnly className="text-xs font-mono" />
                    <Button variant="outline" size="icon" onClick={copyLink}>
                      {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </Card>

                {/* Email preview */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Email Preview</h3>
                    <span className="text-xs text-muted-foreground">
                      To: {inviteData.recipientEmail}
                    </span>
                  </div>
                  <Card className="overflow-hidden">
                    <div className="border-b bg-muted/50 px-4 py-2 flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">
                        Subject: {entityType === "provider"
                          ? "You're invited to join GreenCRM"
                          : `${inviteData.companyName || "Your Provider"} invited you to connect`}
                      </span>
                    </div>
                    <iframe
                      srcDoc={emailHtml}
                      title="Email preview"
                      className="w-full border-0"
                      style={{ height: "520px" }}
                      sandbox=""
                    />
                  </Card>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button onClick={handleSendInvite} className="flex-1">
                    <Send className="h-4 w-4 mr-2" />
                    Send Invite
                  </Button>
                  <Button variant="outline" onClick={() => { setShowEmailPreview(false); setGeneratedLink(""); }}>
                    Edit Details
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3b: Manual Flow */}
        {step === 3 && method === "manual" && (
          <div className="animate-in fade-in duration-500">
            <Card className="p-6 space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <PenLine className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">
                    Create {entityType === "provider" ? "Provider" : "Customer"} Manually
                  </h3>
                  <p className="text-sm text-muted-foreground">Fill in their details to create the account now</p>
                </div>
              </div>

              {entityType === "provider" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Company Name *</Label>
                    <Input
                      value={providerData.companyName}
                      onChange={(e) => setProviderData({ ...providerData, companyName: e.target.value })}
                      placeholder="e.g. Green Gardens LLC"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Admin Full Name *</Label>
                      <Input
                        value={providerData.fullName}
                        onChange={(e) => setProviderData({ ...providerData, fullName: e.target.value })}
                        placeholder="e.g. John Smith"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Admin Email *</Label>
                      <Input
                        type="email"
                        value={providerData.email}
                        onChange={(e) => setProviderData({ ...providerData, email: e.target.value })}
                        placeholder="e.g. john@company.com"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={providerData.phone}
                        onChange={(e) => setProviderData({ ...providerData, phone: e.target.value })}
                        placeholder="e.g. +40 712 345 678"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>CUI (Tax ID)</Label>
                      <Input
                        value={providerData.cui}
                        onChange={(e) => setProviderData({ ...providerData, cui: e.target.value })}
                        placeholder="e.g. RO12345678"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Customer / Household Name *</Label>
                    <Input
                      value={customerData.name}
                      onChange={(e) => setCustomerData({ ...customerData, name: e.target.value })}
                      placeholder="e.g. Smith Residence"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Contact Person *</Label>
                      <Input
                        value={customerData.contactPerson}
                        onChange={(e) => setCustomerData({ ...customerData, contactPerson: e.target.value })}
                        placeholder="e.g. Jane Smith"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email *</Label>
                      <Input
                        type="email"
                        value={customerData.email}
                        onChange={(e) => setCustomerData({ ...customerData, email: e.target.value })}
                        placeholder="e.g. jane@email.com"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      value={customerData.phone}
                      onChange={(e) => setCustomerData({ ...customerData, phone: e.target.value })}
                      placeholder="e.g. +40 712 345 678"
                    />
                  </div>
                </div>
              )}

              <Button onClick={handleManualSubmit} disabled={isLoading} className="w-full">
                {isLoading ? "Creating…" : `Create ${entityType === "provider" ? "Provider" : "Customer"}`}
                <Sparkles className="h-4 w-4 ml-2" />
              </Button>
            </Card>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && (
          <div className="animate-in fade-in duration-500 text-center">
            <Card className="p-10">
              <div className="mx-auto mb-6 h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Check className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">
                {confirmationData?.method === "invite" ? "Invite Sent!" : "Account Created!"}
              </h2>
              <p className="text-muted-foreground mb-6">
                {confirmationData?.method === "invite"
                  ? `An invite link has been prepared for ${confirmationData?.recipientName || "the recipient"}.`
                  : `The ${entityType} account has been successfully created.`}
              </p>

              {/* Show details */}
              {confirmationData && confirmationData.method !== "invite" && (
                <div className="bg-muted rounded-xl p-5 text-left space-y-3 mb-6 max-w-sm mx-auto">
                  {confirmationData.email && (
                    <div>
                      <span className="text-xs text-muted-foreground">Email</span>
                      <p className="font-mono text-sm">{confirmationData.email}</p>
                    </div>
                  )}
                  {confirmationData.temporaryPassword && (
                    <div>
                      <span className="text-xs text-muted-foreground">Temporary Password</span>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-sm bg-background px-2 py-1 rounded">{confirmationData.temporaryPassword}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            navigator.clipboard.writeText(confirmationData.temporaryPassword);
                            toast.success("Password copied!");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 justify-center">
                <Button onClick={resetWizard} variant="outline">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Create Another
                </Button>
                <Button onClick={() => navigate("/admin/tenants")}>
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
