import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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
    const { error } = await signUp(
      form.get("email") as string,
      form.get("password") as string,
      form.get("fullName") as string
    );
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    if (inviteToken) {
      toast.success("Account created! Check your email to confirm, then sign in to activate your provider account.");
    } else if (connectCode) {
      toast.success("Account created! Check your email to confirm, then sign in to connect your properties.");
    } else {
      toast.success("Check your email to confirm your account!");
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
