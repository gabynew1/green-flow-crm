import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Leaf, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path
        fill="#4285F4"
        d="M21.81 12.23c0-.72-.06-1.25-.19-1.8H12.2v3.56h5.53c-.11.88-.71 2.2-2.04 3.09l-.02.12 2.85 2.21.2.02c1.84-1.7 2.89-4.2 2.89-7.2Z"
      />
      <path
        fill="#34A853"
        d="M12.2 22c2.71 0 4.98-.89 6.64-2.41l-3.17-2.46c-.85.59-1.99 1-3.47 1-2.65 0-4.89-1.74-5.69-4.15l-.11.01-2.96 2.3-.04.11A10.03 10.03 0 0 0 12.2 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.51 13.98A6.03 6.03 0 0 1 6.17 12c0-.69.12-1.36.32-1.98l-.01-.13-3-2.34-.1.05A10 10 0 0 0 2.2 12c0 1.6.38 3.11 1.06 4.4l3.25-2.42Z"
      />
      <path
        fill="#EA4335"
        d="M12.2 5.87c1.87 0 3.13.81 3.84 1.48l2.8-2.73C17.16 3.07 14.9 2 12.2 2a10.03 10.03 0 0 0-8.82 5.6l3.11 2.42c.81-2.41 3.04-4.15 5.7-4.15Z"
      />
    </svg>
  );
}

function GoogleSignInSection({
  isLoading,
  onClick,
}: {
  isLoading: boolean;
  onClick: () => Promise<void>;
}) {
  return (
    <div className="space-y-4 pt-4">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full justify-center gap-3 border-border bg-background font-medium text-foreground shadow-sm hover:bg-muted"
        onClick={() => void onClick()}
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
    </div>
  );
}

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [showSignInPw, setShowSignInPw] = useState(false);
  const [showSignUpPw, setShowSignUpPw] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const inviteToken = searchParams.get("invite");
  const connectCode = searchParams.get("connect");
  const prefillEmail = searchParams.get("email") || "";
  const prefillTab = searchParams.get("tab");
  const [inviteInfo, setInviteInfo] = useState<{ role: string; tenant_name?: string } | null>(null);
  const [connectProviderName, setConnectProviderName] = useState<string | null>(null);

  useEffect(() => {
    if (inviteToken) {
      supabase
        .from("provider_invites")
        .select("role, tenant_id, tenants(name)")
        .eq("token", inviteToken)
        .is("used_by", null)
        .single()
        .then(({ data }) => {
          if (data) {
            setInviteInfo({
              role: data.role,
              tenant_name: (data as any).tenants?.name,
            });
          }
        });
    }
    if (connectCode) {
      supabase
        .from("tenants")
        .select("name")
        .eq("unique_tenant_id", connectCode.toUpperCase())
        .single()
        .then(({ data }) => {
          if (data) setConnectProviderName(data.name);
        });
    }
  }, [inviteToken, connectCode]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const form = new FormData(e.currentTarget);
    const { error } = await signIn(form.get("email") as string, form.get("password") as string);
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      if (connectCode) {
        navigate(`/client/connect?provider=${connectCode}`);
      } else {
        navigate("/");
      }
    }
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const form = new FormData(e.currentTarget);
    const email = form.get("email") as string;
    const password = form.get("password") as string;
    const fullName = form.get("fullName") as string;

    // Client-side password strength check
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long");
      setIsLoading(false);
      return;
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      toast.error("Password must contain at least one uppercase letter and one number");
      setIsLoading(false);
      return;
    }

    const { error } = await signUp(email, password, fullName);
    setIsLoading(false);
    if (error) {
      const msg = error.message?.toLowerCase() || "";
      if (msg.includes("already registered") || msg.includes("already been registered") || msg.includes("user already exists")) {
        toast.error("An account with this email already exists. Try signing in or resetting your password.", {
          action: {
            label: "Reset Password",
            onClick: () => {
              setForgotEmail(email);
              setShowForgot(true);
            },
          },
          duration: 8000,
        });
      } else if (msg.includes("password") && (msg.includes("weak") || msg.includes("short") || msg.includes("strength"))) {
        toast.error("Password is too weak. Use at least 6 characters with uppercase letters, numbers, and symbols.");
      } else {
        toast.error(error.message);
      }
      return;
    }

    // With auto-confirm, user is immediately signed in
    if (inviteToken) {
      try {
        await supabase.functions.invoke("accept-provider-invite", { body: { inviteToken } });
        toast.success("Account created & provider invite accepted!");
      } catch {
        toast.success("Account created! Sign in to activate your provider account.");
      }
      navigate("/");
    } else if (connectCode) {
      toast.success("Account created! Redirecting to connect your properties...");
      navigate(`/client/connect?provider=${connectCode}`);
    } else {
      toast.success("Account created successfully!");
      navigate("/");
    }
  };

  const handleSignInWithInvite = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const form = new FormData(e.currentTarget);
    const { error } = await signIn(form.get("email") as string, form.get("password") as string);
    if (error) {
      toast.error(error.message);
      setIsLoading(false);
      return;
    }

    if (inviteToken) {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke("accept-provider-invite", {
          body: { inviteToken },
        });
        if (fnErr) throw fnErr;
        toast.success("Provider account activated!");
      } catch (err: any) {
        toast.error(err.message || "Failed to accept invite");
      }
    }
    setIsLoading(false);
    navigate("/");
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail.trim()) {
      toast.error("Enter your email address");
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password reset link sent! Check your email.");
      setShowForgot(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);

    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: prefillEmail ? { login_hint: prefillEmail } : undefined,
    });

    if (error) {
      setIsLoading(false);
      toast.error(error.message || "Google sign-in failed");
    }
  };

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
                Sign up or log in to connect your properties.
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {showForgot ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Reset Password</h3>
              <p className="text-sm text-muted-foreground">Enter your email and we'll send you a reset link.</p>
              <div className="space-y-2">
                <Label htmlFor="forgot-email">Email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>
              <Button onClick={handleForgotPassword} className="w-full" disabled={isLoading}>
                {isLoading ? "Sending…" : "Send Reset Link"}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setShowForgot(false)}>
                Back to Sign In
              </Button>
            </div>
          ) : (
            <Tabs defaultValue={inviteToken ? "signup" : prefillTab === "signup" ? "signup" : "signin"}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin">
                {!inviteToken && (
                  <GoogleSignInSection isLoading={isLoading} onClick={handleGoogleSignIn} />
                )}
                <form onSubmit={inviteToken ? handleSignInWithInvite : handleSignIn} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input id="signin-email" name="email" type="email" required defaultValue={prefillEmail} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="signin-password"
                        name="password"
                        type={showSignInPw ? "text" : "password"}
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignInPw(!showSignInPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showSignInPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                      onClick={() => setShowForgot(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Signing in…" : inviteToken ? "Sign In & Accept Invite" : "Sign In"}
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup">
                {!inviteToken && (
                  <GoogleSignInSection isLoading={isLoading} onClick={handleGoogleSignIn} />
                )}
                <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input id="signup-name" name="fullName" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input id="signup-email" name="email" type="email" required defaultValue={prefillEmail} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        name="password"
                        type={showSignUpPw ? "text" : "password"}
                        required
                        minLength={6}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignUpPw(!showSignUpPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showSignUpPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Creating account…" : inviteToken ? "Create Provider Account" : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
