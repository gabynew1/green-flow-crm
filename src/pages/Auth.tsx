import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEmailCheck } from "@/hooks/useEmailCheck";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Leaf, Info, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";

import AuthEmailStep from "@/components/auth/AuthEmailStep";
import AuthPasswordStep from "@/components/auth/AuthPasswordStep";
import AuthForgotStep from "@/components/auth/AuthForgotStep";

/* ---------- Types ---------- */
type AuthStep = "email" | "login" | "forgot";

/* ---------- Main Component ---------- */
export default function Auth() {
  const { signIn } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkEmail, isChecking, error: emailError, reset: resetEmailCheck } = useEmailCheck();

  // URL params
  const inviteToken = searchParams.get("invite");
  const connectCode = searchParams.get("connect");
  const prefillEmail = searchParams.get("email") || "";
  const prefillTab = searchParams.get("tab");
  const source = searchParams.get("source"); // "landing" when coming from hero/Start Free

  // State
  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailKnown, setEmailKnown] = useState(false); // internal hint, not exposed to user
  const [inlineMsg, setInlineMsg] = useState<{ type: "info" | "error" | "success"; text: string } | null>(null);

  // Invite/connect state
  const [inviteInfo, setInviteInfo] = useState<{ role: string; tenant_name?: string } | null>(null);
  const [connectProviderName, setConnectProviderName] = useState<string | null>(null);

  const passwordRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Fetch invite/connect info
  useEffect(() => {
    if (inviteToken) {
      supabase.rpc("lookup_invite_by_token", { _token: inviteToken }).then(({ data }) => {
        if (data && data.length > 0) {
          setInviteInfo({ role: data[0].role, tenant_name: data[0].tenant_name });
        }
      });
    }
    if (connectCode) {
      supabase.rpc("lookup_tenant_by_code", { _code: connectCode.toUpperCase() }).then(({ data }) => {
        if (data && data.length > 0) setConnectProviderName(data[0].name);
      });
    }
  }, [inviteToken, connectCode]);

  // Auto-advance if email is prefilled AND tab hint is given
  useEffect(() => {
    if (prefillEmail && prefillTab === "signin") {
      setStep("login");
    }
  }, [prefillEmail, prefillTab]);

  // Focus password field when entering login step
  useEffect(() => {
    if (step === "login") {
      setTimeout(() => passwordRef.current?.focus(), 100);
    }
  }, [step]);

  /* ---------- Handlers ---------- */

  /**
   * Email submit: always transitions to the login step.
   * We check email existence internally for UX hints but
   * the user sees the same screen regardless.
   */
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineMsg(null);

    const exists = await checkEmail(email);
    if (exists === null) return; // validation error shown by hook

    setEmailKnown(!!exists);

    // Always go to the login/continue step — don't branch visibly
    setStep("login");
    setInlineMsg({
      type: "info",
      text: "Enter your password to sign in, or create a new account below.",
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsLoading(true);
    setInlineMsg(null);

    const { error } = await signIn(email.trim(), password);
    if (error) {
      // SECURITY: Generic error — don't differentiate between
      // "no account" and "wrong password"
      const msg = error.message?.toLowerCase() || "";
      if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
        setInlineMsg({
          type: "error",
          text: "Unable to sign in. Please check your credentials or create an account.",
        });
      } else {
        // Don't leak raw error details to users
        setInlineMsg({
          type: "error",
          text: "Something went wrong. Please try again.",
        });
      }
      setIsLoading(false);
      return;
    }

    // Accept invite if present
    if (inviteToken) {
      try {
        await supabase.functions.invoke("accept-provider-invite", { body: { inviteToken } });
        toast.success("Provider invite accepted!");
      } catch {
        // silent — they can accept later
      }
    }

    setIsLoading(false);
    if (connectCode) {
      navigate(`/client/connect?provider=${connectCode}`);
    } else {
      navigate("/");
    }
  };

  const goBackToEmail = () => {
    setStep("email");
    setPassword("");
    setInlineMsg(null);
    setEmailKnown(false);
    resetEmailCheck();
    setTimeout(() => emailInputRef.current?.focus(), 100);
  };

  const handleCreateAccount = () => {
    const params = new URLSearchParams();
    params.set("email", email.trim());
    params.set("source", "landing");
    if (connectCode) params.set("connect", connectCode);
    navigate(`/onboard?${params.toString()}`);
  };

  /* ---------- Render ---------- */
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Leaf className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">GreenCRM</CardTitle>
          <CardDescription>{t("auth:tagline")}</CardDescription>
          {inviteInfo && (
            <Badge variant="secondary" className="mt-2">
              Provider Invite: {inviteInfo.tenant_name || "New Tenant"} ({inviteInfo.role})
            </Badge>
          )}
          {connectProviderName && !inviteInfo && (
            <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium text-foreground">
                You've been invited by <strong>{connectProviderName}</strong>
              </p>
              <p className="text-muted-foreground mt-1">
                Sign in or create an account to connect your properties.
              </p>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {/* ─── INLINE MESSAGE ─── */}
          {(inlineMsg || emailError) && (
            <Alert
              variant={inlineMsg?.type === "error" || emailError ? "destructive" : "default"}
              className="mb-4"
            >
              {inlineMsg?.type === "error" || emailError ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <Info className="h-4 w-4" />
              )}
              <AlertDescription className="ml-2">
                {emailError || inlineMsg?.text}
              </AlertDescription>
            </Alert>
          )}

          {/* ─── STEP: EMAIL ─── */}
          {step === "email" && (
            <AuthEmailStep
              ref={emailInputRef}
              email={email}
              onEmailChange={setEmail}
              onSubmit={handleEmailSubmit}
              isChecking={isChecking}
              isLoading={isLoading}
              hideOAuthForInvite={!!inviteToken}
              onClearInlineMsg={() => setInlineMsg(null)}
            />
          )}

          {/* ─── STEP: LOGIN ─── */}
          {step === "login" && (
            <AuthPasswordStep
              ref={passwordRef}
              email={email}
              password={password}
              onPasswordChange={setPassword}
              onSubmit={handleLogin}
              onBack={goBackToEmail}
              onForgot={() => {
                setStep("forgot");
                setInlineMsg(null);
              }}
              onCreateAccount={handleCreateAccount}
              isLoading={isLoading}
              inviteToken={inviteToken}
              emailKnown={emailKnown}
            />
          )}

          {/* ─── STEP: FORGOT PASSWORD ─── */}
          {step === "forgot" && (
            <AuthForgotStep
              initialEmail={email}
              onBack={() => {
                setStep("login");
                setInlineMsg(null);
              }}
              onMessage={setInlineMsg}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
