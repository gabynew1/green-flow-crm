import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2, MailX } from "lucide-react";

type Status = "loading" | "valid" | "already" | "invalid" | "success" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!token) { setStatus("invalid"); return; }

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${token}`;
    fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
      .then(r => r.json())
      .then(d => {
        if (d.valid === false && d.reason === "already_unsubscribed") setStatus("already");
        else if (d.valid) setStatus("valid");
        else setStatus("invalid");
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  const handleConfirm = async () => {
    setStatus("loading");
    try {
      const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
      if (error) throw error;
      if (data?.success) setStatus("success");
      else if (data?.reason === "already_unsubscribed") setStatus("already");
      else setStatus("error");
    } catch { setStatus("error"); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
          {status === "loading" && <Loader2 className="h-10 w-10 animate-spin text-primary" />}

          {status === "valid" && (
            <>
              <MailX className="h-12 w-12 text-primary" />
              <h1 className="text-xl font-bold text-foreground">Unsubscribe</h1>
              <p className="text-muted-foreground text-sm">Click below to stop receiving app emails from GreenGrass.</p>
              <Button onClick={handleConfirm} className="mt-2">Confirm Unsubscribe</Button>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle className="h-12 w-12 text-green-600" />
              <h1 className="text-xl font-bold text-foreground">You're unsubscribed</h1>
              <p className="text-muted-foreground text-sm">You won't receive any more app emails from us.</p>
            </>
          )}

          {status === "already" && (
            <>
              <CheckCircle className="h-12 w-12 text-muted-foreground" />
              <h1 className="text-xl font-bold text-foreground">Already unsubscribed</h1>
              <p className="text-muted-foreground text-sm">You've already opted out of app emails.</p>
            </>
          )}

          {status === "invalid" && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <h1 className="text-xl font-bold text-foreground">Invalid link</h1>
              <p className="text-muted-foreground text-sm">This unsubscribe link is invalid or has expired.</p>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
              <p className="text-muted-foreground text-sm">Please try again later.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
