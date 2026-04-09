import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  TreePine,
  Leaf,
  Phone,
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

// Leaf confetti component
function LeafConfetti() {
  const leaves = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        emoji: ["🍃", "🌿", "🌱", "☘️"][i % 4],
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 2}s`,
        duration: `${3 + Math.random() * 4}s`,
        size: `${18 + Math.random() * 14}px`,
      })),
    []
  );

  return (
    <div className="leaf-confetti-container">
      {leaves.map((l) => (
        <span
          key={l.id}
          className="leaf"
          style={{
            left: l.left,
            animationDelay: l.delay,
            animationDuration: l.duration,
            fontSize: l.size,
            animationName: "leaf-fall",
          }}
        >
          {l.emoji}
        </span>
      ))}
    </div>
  );
}

// Floating label input
function FloatingInput({
  id,
  label,
  value,
  onChange,
  type = "text",
  required,
  prefix,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  prefix?: string;
}) {
  return (
    <div className="floating-label-group relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium z-10">
          {prefix}
        </span>
      )}
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder=" "
        className={cn("peer pt-4 pb-2 h-12", prefix && "pl-12")}
      />
      <label
        htmlFor={id}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none transition-all duration-200",
          prefix ? "left-12" : "left-3",
          "peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-primary peer-focus:bg-background peer-focus:px-1",
          value && "top-2 translate-y-0 text-xs text-primary bg-background px-1"
        )}
      >
        {label}{required && " *"}
      </label>
      {value && (
        <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-success" />
      )}
    </div>
  );
}

const STEP_LABELS_FULL = ["Welcome", "Type", "Method", "Details", "Done"];
const STEP_LABELS_PUBLIC = ["Welcome", "Type", "Details", "Done"];

export default function AdminOnboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPublic = searchParams.get("source") === "landing";
  const prefilledEmail = searchParams.get("email") || "";

  const [step, setStep] = useState(0); // 0-indexed, 0 = welcome
  const [direction, setDirection] = useState<"next" | "back">("next");
  const [entityType, setEntityType] = useState<EntityType>(null);
  const [method, setMethod] = useState<OnboardMethod>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const [inviteData, setInviteData] = useState<InviteData>({
    recipientName: "",
    recipientEmail: "",
    companyName: "",
  });

  const [providerData, setProviderData] = useState<ManualProviderData>({
    companyName: "",
    fullName: "",
    email: prefilledEmail,
    phone: "",
    cui: "",
  });
  const [customerData, setCustomerData] = useState<ManualCustomerData>({
    name: "",
    contactPerson: "",
    email: prefilledEmail,
    phone: "",
  });

  const [confirmationData, setConfirmationData] = useState<any>(null);

  const stepLabels = isPublic ? STEP_LABELS_PUBLIC : STEP_LABELS_FULL;
  const totalSteps = stepLabels.length;
  // Map internal step to display step for progress
  const displayStep = isPublic && step > 1 ? step - 1 : step;
  const progressValue = ((displayStep + 1) / totalSteps) * 100;

  const goNext = (nextStep: number) => {
    setDirection("next");
    setStep(nextStep);
  };

  const goBack = () => {
    if (step === 0) {
      navigate(isPublic ? "/" : "/admin/tenants");
    } else if (isPublic && step === 3) {
      // Skip back over the method step in public mode
      setDirection("back");
      setStep(1);
    } else {
      setDirection("back");
      setStep(step - 1);
    }
  };

  const handleTypeSelect = (type: EntityType) => {
    setEntityType(type);
    setMethod(null);
    if (isPublic) {
      // Skip method selection, go directly to details
      setMethod("manual");
      goNext(3);
    } else {
      goNext(2);
    }
  };

  const handleMethodSelect = (m: OnboardMethod) => {
    setMethod(m);
    goNext(3);
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
        ? { type: "provider", data: providerData, ...(isPublic && { source: "public" }) }
        : { type: "customer", data: customerData, ...(isPublic && { source: "public" }) };

      const { data, error } = await supabase.functions.invoke("create-manual-user", { body });
      if (error) throw error;

      setConfirmationData(data);
      setShowConfetti(true);
      goNext(4);
      toast.success(`${entityType === "provider" ? "Provider" : "Customer"} created successfully!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendInvite = () => {
    toast.info("Email sending will be available after domain setup. Link has been copied instead.");
    copyLink();
    setConfirmationData({
      type: entityType,
      method: "invite",
      recipientName: inviteData.recipientName,
      recipientEmail: inviteData.recipientEmail,
      link: generatedLink,
    });
    setShowConfetti(true);
    goNext(4);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const resetWizard = () => {
    setStep(0);
    setDirection("next");
    setEntityType(null);
    setMethod(null);
    setGeneratedLink("");
    setShowEmailPreview(false);
    setCopied(false);
    setShowConfetti(false);
    setInviteData({ recipientName: "", recipientEmail: "", companyName: "" });
    setProviderData({ companyName: "", fullName: "", email: "", phone: "", cui: "" });
    setCustomerData({ name: "", contactPerson: "", email: "", phone: "" });
    setConfirmationData(null);
  };

  // Hide confetti after a few seconds
  useEffect(() => {
    if (showConfetti) {
      const t = setTimeout(() => setShowConfetti(false), 6000);
      return () => clearTimeout(t);
    }
  }, [showConfetti]);

  const emailHtml = entityType === "provider"
    ? getProviderEmailHtml(inviteData.recipientName || "there", generatedLink || "#")
    : getCustomerEmailHtml(inviteData.recipientName || "there", inviteData.companyName || "Your Provider", generatedLink || "#");

  const animClass = direction === "next" ? "animate-slide-in-right" : "animate-slide-in-left";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background">
      {showConfetti && <LeafConfetti />}

      {/* Progress bar — hidden on welcome */}
      {step > 0 && (
        <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-sm border-b border-border px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <Progress value={progressValue} className="h-1.5 mb-2" />
            <div className="flex justify-between">
              {stepLabels.map((label, i) => (
                <span
                  key={label}
                  className={cn(
                    "text-xs font-medium transition-colors",
                    (isPublic && i > 1 ? i + 1 : i) <= step ? "text-primary" : "text-muted-foreground/40"
                  )}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Step 0: Welcome Hero */}
        {step === 0 && (
          <div key="welcome" className={cn("text-center py-12 sm:py-20", animClass)}>
            {/* Decorative illustration */}
            <div className="relative mx-auto mb-10 w-32 h-32">
              <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse-glow" />
              <div className="absolute inset-2 rounded-full bg-primary/5 flex items-center justify-center">
                <TreePine className="h-16 w-16 text-primary" strokeWidth={1.5} />
              </div>
              <Leaf className="absolute -top-2 -right-2 h-8 w-8 text-primary/60 rotate-45" />
              <Leaf className="absolute -bottom-1 -left-3 h-6 w-6 text-primary/40 -rotate-12" />
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
              Your business,{" "}
              <span className="text-primary">in full bloom.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg mx-auto mb-10 leading-relaxed">
              The all-in-one tool to manage designs, irrigation, and maintenance — without the paperwork.
            </p>

            <Button
              size="lg"
              onClick={() => goNext(1)}
              className="text-lg px-10 py-6 rounded-2xl shadow-lg hover:scale-105 transition-transform duration-200"
            >
              Let's get started
              <ArrowRight className="h-5 w-5 ml-2" />
            </Button>

            <div className="mt-16 flex items-center justify-center gap-8 text-muted-foreground/50">
              <div className="flex flex-col items-center gap-1">
                <Building2 className="h-5 w-5" />
                <span className="text-xs">Providers</span>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="flex flex-col items-center gap-1">
                <Users className="h-5 w-5" />
                <span className="text-xs">Customers</span>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="flex flex-col items-center gap-1">
                <Sparkles className="h-5 w-5" />
                <span className="text-xs">Contracts</span>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Choose Type */}
        {step === 1 && (
          <div key="type" className={animClass}>
            <div className="flex items-center gap-3 mb-8">
              <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Who are you onboarding?</h2>
                <p className="text-sm text-muted-foreground">Choose the type of account to create</p>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {[
                {
                  type: "provider" as const,
                  icon: Building2,
                  title: "Service Provider",
                  desc: "A landscaping company or independent professional who delivers services to clients.",
                  accent: "🌿",
                },
                {
                  type: "customer" as const,
                  icon: Users,
                  title: "Customer",
                  desc: "A property owner or household who receives services from a provider.",
                  accent: "🏡",
                },
              ].map((item) => (
                <div
                  key={item.type}
                  className="gradient-border-card cursor-pointer group"
                  onClick={() => handleTypeSelect(item.type)}
                >
                  <Card className="p-8 text-center border-2 border-transparent transition-all duration-300 hover:shadow-xl hover:border-primary/20">
                    <div className="mx-auto mb-5 h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:animate-bounce-subtle transition-all">
                      <item.icon className="h-10 w-10 text-primary" />
                    </div>
                    <span className="text-2xl mb-3 block">{item.accent}</span>
                    <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Choose Method */}
        {step === 2 && (
          <div key="method" className={animClass}>
            <div className="flex items-center gap-3 mb-8">
              <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">How would you like to onboard?</h2>
                <p className="text-sm text-muted-foreground">
                  Choose how to set up the {entityType === "provider" ? "provider" : "customer"}
                </p>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {[
                {
                  method: "invite" as const,
                  icon: Mail,
                  title: "Send Invite Link",
                  desc: "Send a personalized email with an onboarding link. They'll set up their own account.",
                  accent: "📧",
                },
                {
                  method: "manual" as const,
                  icon: PenLine,
                  title: "Enter Details",
                  desc: "Enter their details now and create their account immediately. You'll get a temporary password.",
                  accent: "✍️",
                },
              ].map((item) => (
                <div
                  key={item.method}
                  className="gradient-border-card cursor-pointer group"
                  onClick={() => handleMethodSelect(item.method)}
                >
                  <Card className="p-8 text-center border-2 border-transparent transition-all duration-300 hover:shadow-xl hover:border-primary/20">
                    <div className="mx-auto mb-5 h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:animate-bounce-subtle transition-all">
                      <item.icon className="h-10 w-10 text-primary" />
                    </div>
                    <span className="text-2xl mb-3 block">{item.accent}</span>
                    <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                  </Card>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3a: Invite Flow */}
        {step === 3 && method === "invite" && (
          <div key="invite" className={cn(animClass, "space-y-6")}>
            <div className="flex items-center gap-3 mb-2">
              <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Configure the invitation</h2>
                <p className="text-sm text-muted-foreground">We'll generate a personalized invite</p>
              </div>
            </div>

            {!showEmailPreview ? (
              <Card className="p-6 sm:p-8 space-y-6 border-2">
                <div className="flex items-center gap-3 pb-4 border-b border-border">
                  <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      Invite a {entityType === "provider" ? "Service Provider" : "Customer"}
                    </h3>
                    <p className="text-sm text-muted-foreground">Fill in the recipient details</p>
                  </div>
                </div>

                <div className="space-y-5">
                  <FloatingInput
                    id="recipientName"
                    label="Recipient Name"
                    value={inviteData.recipientName}
                    onChange={(v) => setInviteData({ ...inviteData, recipientName: v })}
                    required
                  />
                  <FloatingInput
                    id="recipientEmail"
                    label="Recipient Email"
                    value={inviteData.recipientEmail}
                    onChange={(v) => setInviteData({ ...inviteData, recipientEmail: v })}
                    type="email"
                    required
                  />
                  <FloatingInput
                    id="companyName"
                    label={entityType === "provider" ? "Company Name" : "Provider / Household Name"}
                    value={inviteData.companyName}
                    onChange={(v) => setInviteData({ ...inviteData, companyName: v })}
                  />
                </div>

                <Button
                  onClick={handleInviteSubmit}
                  disabled={isLoading}
                  className="w-full h-12 text-base rounded-xl hover:scale-[1.02] transition-transform"
                >
                  {isLoading ? "Generating…" : "Generate Invite"}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Card>
            ) : (
              <div className="space-y-4 animate-slide-in-right">
                {/* Link copy bar */}
                <Card className="p-4 border-2">
                  <label className="text-xs text-muted-foreground mb-2 block font-medium">Invite Link</label>
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
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                      Email Preview
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      To: {inviteData.recipientEmail}
                    </span>
                  </div>
                  <Card className="overflow-hidden border-2">
                    <div className="border-b bg-muted/50 px-4 py-2.5 flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">
                        Subject:{" "}
                        {entityType === "provider"
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
                  <Button
                    onClick={handleSendInvite}
                    className="flex-1 h-12 rounded-xl hover:scale-[1.02] transition-transform"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Invite
                  </Button>
                  <Button
                    variant="outline"
                    className="h-12 rounded-xl"
                    onClick={() => {
                      setShowEmailPreview(false);
                      setGeneratedLink("");
                    }}
                  >
                    Edit Details
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3b: Manual Flow */}
        {step === 3 && method === "manual" && (
          <div key="manual" className={animClass}>
            <div className="flex items-center gap-3 mb-8">
              <Button variant="ghost" size="icon" onClick={goBack} className="shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Enter their details</h2>
                <p className="text-sm text-muted-foreground">Create the account right now</p>
              </div>
            </div>

            <Card className="p-6 sm:p-8 space-y-6 border-2">
              <div className="flex items-center gap-3 pb-4 border-b border-border">
                <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
                  <PenLine className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">
                    Create {entityType === "provider" ? "Provider" : "Customer"} Manually
                  </h3>
                  <p className="text-sm text-muted-foreground">Fill in their details to create the account</p>
                </div>
              </div>

              {entityType === "provider" ? (
                <div className="space-y-5">
                  <FloatingInput
                    id="pCompany"
                    label="Company Name"
                    value={providerData.companyName}
                    onChange={(v) => setProviderData({ ...providerData, companyName: v })}
                    required
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FloatingInput
                      id="pFullName"
                      label="Admin Full Name"
                      value={providerData.fullName}
                      onChange={(v) => setProviderData({ ...providerData, fullName: v })}
                      required
                    />
                    <FloatingInput
                      id="pEmail"
                      label="Admin Email"
                      value={providerData.email}
                      onChange={(v) => setProviderData({ ...providerData, email: v })}
                      type="email"
                      required
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FloatingInput
                      id="pPhone"
                      label="Phone"
                      value={providerData.phone}
                      onChange={(v) => setProviderData({ ...providerData, phone: v })}
                      prefix="+40"
                    />
                    <FloatingInput
                      id="pCui"
                      label="CUI (Tax ID)"
                      value={providerData.cui}
                      onChange={(v) => setProviderData({ ...providerData, cui: v })}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <FloatingInput
                    id="cName"
                    label="Customer / Household Name"
                    value={customerData.name}
                    onChange={(v) => setCustomerData({ ...customerData, name: v })}
                    required
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FloatingInput
                      id="cContact"
                      label="Contact Person"
                      value={customerData.contactPerson}
                      onChange={(v) => setCustomerData({ ...customerData, contactPerson: v })}
                      required
                    />
                    <FloatingInput
                      id="cEmail"
                      label="Email"
                      value={customerData.email}
                      onChange={(v) => setCustomerData({ ...customerData, email: v })}
                      type="email"
                      required
                    />
                  </div>
                  <FloatingInput
                    id="cPhone"
                    label="Phone"
                    value={customerData.phone}
                    onChange={(v) => setCustomerData({ ...customerData, phone: v })}
                    prefix="+40"
                  />
                </div>
              )}

              <Button
                onClick={handleManualSubmit}
                disabled={isLoading}
                className="w-full h-12 text-base rounded-xl hover:scale-[1.02] transition-transform"
              >
                {isLoading ? "Creating…" : `Create ${entityType === "provider" ? "Provider" : "Customer"}`}
                <Sparkles className="h-4 w-4 ml-2" />
              </Button>
            </Card>
          </div>
        )}

        {/* Step 4: Celebration */}
        {step === 4 && (
          <div key="done" className={cn("text-center py-12", animClass)}>
            {/* Success icon with glow */}
            <div className="relative mx-auto mb-8 w-28 h-28">
              <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse-glow" />
              <div className="absolute inset-3 rounded-full bg-primary/20 flex items-center justify-center">
                <Check className="h-14 w-14 text-primary" strokeWidth={2.5} />
              </div>
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
              {confirmationData?.method === "invite"
                ? "Invite Ready! 🎉"
                : "Congratulations! 🌱"}
            </h2>
            <p className="text-lg text-muted-foreground mb-2">
              {confirmationData?.method === "invite"
                ? "Your digital garden is growing."
                : "Your digital garden is ready."}
            </p>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              {confirmationData?.method === "invite"
                ? `An invite link has been prepared for ${confirmationData?.recipientName || "the recipient"}.`
                : `The ${entityType} account has been successfully created.`}
            </p>

            {/* Details card */}
            {confirmationData && confirmationData.method !== "invite" && (
              <Card className="bg-muted/50 border-2 rounded-2xl p-6 text-left space-y-4 mb-8 max-w-sm mx-auto">
                {confirmationData.email && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Email
                    </span>
                    <p className="font-mono text-sm mt-1">{confirmationData.email}</p>
                  </div>
                )}
                {confirmationData.temporaryPassword && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Temporary Password
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="font-mono text-sm bg-background px-3 py-1.5 rounded-lg border">
                        {confirmationData.temporaryPassword}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
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
              </Card>
            )}

            <div className="flex gap-3 justify-center">
              <Button
                onClick={resetWizard}
                variant="outline"
                className="h-12 rounded-xl hover:scale-[1.02] transition-transform"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Create Another
              </Button>
              <Button
                onClick={() => navigate(isPublic ? "/auth" : "/admin/tenants")}
                className="h-12 rounded-xl hover:scale-[1.02] transition-transform"
              >
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Enter Platform
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
