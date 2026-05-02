import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmailHistoryTable, type EmailHistoryRow } from "@/components/EmailHistoryTable";
import { Mail, Info } from "lucide-react";

export function CustomerEmailHistoryTab({ customerId }: { customerId: string }) {
  const [rows, setRows] = useState<EmailHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_customer_email_history", {
        _customer_id: customerId,
        _limit: 200,
        _offset: 0,
      });
      if (cancelled) return;
      if (!error && data) setRows(data as EmailHistoryRow[]);
      setLoading(false);
    }
    if (customerId) load();
    return () => { cancelled = true; };
  }, [customerId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4" />
          Emails sent to this customer
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Info className="h-3 w-3" />
          Email history is retained for 1 year, then permanently deleted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EmailHistoryTable rows={rows} loading={loading} showRecipient />
      </CardContent>
    </Card>
  );
}