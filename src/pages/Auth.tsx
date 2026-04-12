import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEmailCheck } from "@/hooks/useEmailCheck";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Leaf, Eye, EyeOff, ArrowLeft, ArrowRight, Loader2, Info, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/* ---------- Types ---------- */
type AuthStep = "email" | "login" | "signup" | "forgot";

/* ---------- Google Icon ---------- */
function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path fill="#4285F4" d="M21.81 12.23c0-.72-.06-1.25-.19-1.8H12.2v3.56h5.53c-.11.88-.71 2.2-2.04 3.09l-.02.12 2.85 2.21.2.02c1.84-1.7 2.89-4.2 2.89-7.2Z" />
      <path fill="#34A853" d="M12.2 22c2.71 0 4.98-.89 6.64-2.41l-3.17-2.46c-.85.59-1.99 1-3.47 1-2.65 0-4.89-1.74-5.69-4.15l-.11.01-2.96 2.3-.04.11A10.03 10.03 0 0 0 12.2 22Z" />
      <path fill="#FBBC05" d="M6.51 13.98A6.03 6.03 0 0 1 6.17 12c0-.69.12-1.36.32-1.98l-.01-.13-3-2.34-.1.05A10 10 0 0 0 2.2 12c0 1.6.38 3.11 1.06 4.4l3.25-2.42Z" />
      <path fill="#EA4335" d="M12.2 5.87c1.87 0 3.13.81 3.84 1.48l2.8-2.73C17.16 3.07 14.9 2 12.2 2a10.03 10.03 0 0 0-8.82 5.6l3.11 2.42c.81-2.41 3.04-4.15 5.7-4.15Z" />
    </svg>
  );
}

/* ---------- Main Component ---------- */
export default function Auth() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { checkEmail, isChecking, error: emailError, reset: resetEmailCheck } = useEmailCheck();

  // URL params
  const inviteToken = searchParams.get("invite");
  const connectCode = searchParams.get("connect");
  const prefillEmail = searchParams.get("email") || "";
  const prefillTab = searchParams.get("tab");

  // State
  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
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

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInlineMsg(null);

    const exists = await checkEmail(email);
    if (exists === null) return; // validation error shown by hook

    if (exists) {
      setStep("login");
      setInlineMsg({ type: "info", text: "Welcome back! Enter your password to sign in." });
    } else {
      // Route to onboard wizard with email prefilled
      const params = new URLSearchParams();
      params.set("email", email.trim());
      params.set("source", "landing");
      if (connectCode) params.set("connect", connectCode);
      navigate(`/onboard?${params.toString()}`);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setIsLoading(true);
    setInlineMsg(null);

    const { error } = await signIn(email.trim(), password);
    if (error) {
      const msg = error.message?.toLowerCase() || "";
      if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
        setInlineMsg({ type: "error", text: "Incorrect password. Please try again or reset it below." });
      } else {
        setInlineMsg({ type: "error", text: error.message });
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

  const handleForgotPassword = async () => {
    const emailToReset = forgotEmail.trim() || email.trim();
    if (!emailToReset) {
      setInlineMsg({ type: "error", text: "Enter your email address to receive a reset link." });
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(emailToReset, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsLoading(false);
    if (error) {
      setInlineMsg({ type: "error", text: error.message });
    } else {
      setInlineMsg({ type: "success", text: "Password reset link sent! Check your email." });
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    const loginHint = email.trim() || undefined;
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: loginHint ? { login_hint: loginHint } : undefined,
    });
    if (error) {
      setIsLoading(false);
      toast.error(error.message || "Google sign-in failed");
    }
  };

  const goBackToEmail = () => {
    setStep("email");
    setPassword("");
    setInlineMsg(null);
    resetEmailCheck();
    setTimeout(() => emailInputRef.current?.focus(), 100);
  };

  const handleSwitchToSignup = () => {
    const params = new URLSearchParams();
    params.set("email", email.trim());
    params.set("source", "landing");
    navigate(`/onboard?${params.toString()}`);
  };

  /* ---------- Render ---------- */
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Leaf className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">GreenCRM</CardTitle>
          <CardDescription>Landscaping & Garden Services</CardDescription>
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
            <div className="space-y-4">
              {!inviteToken && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full justify-center gap-3 border-border bg-background font-medium text-foreground shadow-sm hover:bg-muted"
                    onClick={() => void handleGoogleSignIn()}
                    disabled={isLoading}
                  >
                    <GoogleIcon />
                    Continue with Google
                  </Button>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase tracking-[0.2em]">
                      <span className="bg-background px-3 text-muted-foreground">Or use email</span>
                    </div>
                  </div>
                </>
              )}

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="auth-email">Email</Label>
                  <Input
                    ref={emailInputRef}
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setInlineMsg(null); }}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    autoComplete="email"
                  />
                </div>
                <Button type="submit" className="w-full h-11" disabled={isChecking || isLoading}>
                  {isChecking ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking…</>
                  ) : (
                    <>Continue <ArrowRight className="ml-2 h-4 w-4" /></>
                  )}
                </Button>
              </form>
            </div>
          )}

          {/* ─── STEP: LOGIN ─── */}
          {step === "login" && (
            <div className="space-y-4">
              {/* Email display with edit button */}
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2.5">
                <span className="flex-1 text-sm font-medium text-foreground truncate">{email}</span>
                <button
                  type="button"
                  onClick={goBackToEmail}
                  className="text-xs text-primary hover:underline whitespace-nowrap"
                >
                  Change
                </button>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input
                      ref={passwordRef}
                      id="login-password"
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox id="remember" name="remember" />
                    <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">Remember me</Label>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setForgotEmail(email); setStep("forgot"); setInlineMsg(null); }}
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <Button type="submit" className="w-full h-11" disabled={isLoading}>
                  {isLoading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</>
                  ) : inviteToken ? (
                    "Sign In & Accept Invite"
                  ) : (
                    "Sign In"
                  )}
                </Button>

                <button
                  type="button"
                  onClick={goBackToEmail}
                  className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Use a different email
                </button>
              </form>
            </div>
          )}

          {/* ─── STEP: FORGOT PASSWORD ─── */}
          {step === "forgot" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Reset Password</h3>
              <p className="text-sm text-muted-foreground">We'll send a reset link to your email.</p>
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <Button onClick={handleForgotPassword} className="w-full h-11" disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
                ) : (
                  "Send Reset Link"
                )}
              </Button>
              <button
                type="button"
                onClick={() => { setStep("login"); setInlineMsg(null); }}
                className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
