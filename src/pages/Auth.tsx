import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Leaf } from "lucide-react";
import { toast } from "sonner";

export default function Auth() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const inviteToken = searchParams.get("invite");
  const [inviteInfo, setInviteInfo] = useState<{ role: string; tenant_name?: string } | null>(null);

  useEffect(() => {
    if (inviteToken) {
      // Validate invite token
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
  }, [inviteToken]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    const form = new FormData(e.currentTarget);
    const { error } = await signIn(form.get("email") as string, form.get("password") as string);
    setIsLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      navigate("/");
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
    } else {
      toast.success("Check your email to confirm your account!");
    }
  };

  // After sign in with invite, accept the invite
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
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={inviteToken ? "signup" : "signin"}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={inviteToken ? handleSignInWithInvite : handleSignIn} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input id="signin-email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input id="signin-password" name="password" type="password" required />
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
                  <Input id="signup-email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input id="signup-password" name="password" type="password" required minLength={6} />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? "Creating account…" : inviteToken ? "Create Provider Account" : "Create Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
