import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, Loader2, MailX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

type Status = "loading" | "valid" | "already" | "invalid" | "success" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<Status>("loading");
  const { t } = useTranslation("public");

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
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <div className="absolute top-3 right-3"><LanguageSwitcher /></div>
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8 text-center">
          {status === "loading" && <Loader2 className="h-10 w-10 animate-spin text-primary" />}

          {status === "valid" && (
            <>
              <MailX className="h-12 w-12 text-primary" />
              <h1 className="text-xl font-bold text-foreground">{t("unsubscribe.title")}</h1>
              <p className="text-muted-foreground text-sm">{t("unsubscribe.description")}</p>
              <Button onClick={handleConfirm} className="mt-2">{t("unsubscribe.confirm")}</Button>
            </>
          )}

          {status === "success" && (
            <>
              <CheckCircle className="h-12 w-12 text-green-600" />
              <h1 className="text-xl font-bold text-foreground">{t("unsubscribe.successTitle")}</h1>
              <p className="text-muted-foreground text-sm">{t("unsubscribe.successDesc")}</p>
            </>
          )}

          {status === "already" && (
            <>
              <CheckCircle className="h-12 w-12 text-muted-foreground" />
              <h1 className="text-xl font-bold text-foreground">{t("unsubscribe.alreadyTitle")}</h1>
              <p className="text-muted-foreground text-sm">{t("unsubscribe.alreadyDesc")}</p>
            </>
          )}

          {status === "invalid" && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <h1 className="text-xl font-bold text-foreground">{t("unsubscribe.invalidTitle")}</h1>
              <p className="text-muted-foreground text-sm">{t("unsubscribe.invalidDesc")}</p>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="h-12 w-12 text-destructive" />
              <h1 className="text-xl font-bold text-foreground">{t("unsubscribe.errorTitle")}</h1>
              <p className="text-muted-foreground text-sm">{t("unsubscribe.errorDesc")}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
