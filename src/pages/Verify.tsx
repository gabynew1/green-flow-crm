import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Verify() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user?.email_confirmed_at) {
        navigate("/provider", { replace: true });
        return;
      }
      if (data.user?.email) setEmail(data.user.email);
    })();
  }, [navigate]);

  // If Supabase magic link redirected here, the SDK auto-verifies via URL hash.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=signup") || hash.includes("type=email")) {
      toast.success("Email verified.");
      setTimeout(() => navigate("/provider"), 800);
    }
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || code.length < 6) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setBusy(false);
    if (error) {
      if (error.message.toLowerCase().includes("expired")) toast.error("Code expired. Request a new one.");
      else toast.error("Invalid code.");
    } else {
      toast.success("Email verified.");
      navigate("/provider");
    }
  };

  const resend = async () => {
    if (!email) return;
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) toast.error(error.message);
    else toast.success("New code sent.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Verify your email</CardTitle>
          <CardDescription>Enter the 6-digit code from the email we sent you, or click the link in the email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Verification code</Label>
              <Input id="code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
            </div>
            <Button type="submit" className="w-full" disabled={busy || code.length < 6}>{busy ? "Verifying…" : "Verify email"}</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={resend}>Resend code</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}