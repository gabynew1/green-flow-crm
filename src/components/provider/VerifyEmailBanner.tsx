import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

export function VerifyEmailBanner() {
  const { profile, user } = useAuth();
  const [sending, setSending] = useState(false);

  if (!profile || (profile as any).email_verified) return null;
  const email = (profile as any).email || user?.email;
  if (!email) return null;

  const resend = async () => {
    setSending(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setSending(false);
    if (error) toast.error(error.message);
    else toast.success("Verification email sent. Check your inbox.");
  };

  return (
    <Alert className="rounded-none border-x-0 border-t-0 bg-amber-50 border-amber-200">
      <Mail className="h-4 w-4" />
      <AlertTitle>Verify your email</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-3">
        <span>We sent a confirmation link and code to <strong>{email}</strong>.</span>
        <Link to="/verify" className="underline text-sm">Enter code</Link>
        <Button size="sm" variant="outline" onClick={resend} disabled={sending}>
          {sending ? "Sending…" : "Resend email"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}