import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default function Verify() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const { t } = useTranslation("public");

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
      toast.success(t("verify.verified"));
      setTimeout(() => navigate("/provider"), 800);
    }
  }, [navigate, t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || code.length < 6) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setBusy(false);
    if (error) {
      if (error.message.toLowerCase().includes("expired")) toast.error(t("verify.expired"));
      else toast.error(t("verify.invalid"));
    } else {
      toast.success(t("verify.verified"));
      navigate("/provider");
    }
  };

  const resend = async () => {
    if (!email) return;
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) toast.error(error.message);
    else toast.success(t("verify.newCode"));
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="absolute top-3 right-3"><LanguageSwitcher /></div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("verify.title")}</CardTitle>
          <CardDescription>{t("verify.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("verify.emailLabel")}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">{t("verify.codeLabel")}</Label>
              <Input id="code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" />
            </div>
            <Button type="submit" className="w-full" disabled={busy || code.length < 6}>{busy ? t("verify.verifying") : t("verify.verify")}</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={resend}>{t("verify.resend")}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}