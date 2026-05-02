import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mail } from "lucide-react";

type WebviewData = {
  html: string;
  subject: string;
  template_name: string;
  category: string | null;
  status: string;
  recipient_email: string;
  created_at: string;
};

export default function EmailWebview() {
  const { messageId } = useParams<{ messageId: string }>();
  const [data, setData] = useState<WebviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!messageId) return;
      setLoading(true);
      const { data: res, error: err } = await supabase.functions.invoke(
        "render-email-webview",
        { body: { messageId } }
      );
      if (cancelled) return;
      if (err || !res?.html) {
        setError(
          err?.message?.includes("404") || res?.error === "not_found"
            ? "This email is no longer available. Emails are kept for 1 year and then permanently deleted."
            : "We couldn't load this email. You may not have permission to view it."
        );
      } else {
        setData(res as WebviewData);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4">
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link to="/"><ArrowLeft className="h-4 w-4 mr-2" />Back</Link>
        </Button>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4" />
              {data?.subject || "Email"}
            </CardTitle>
            {data && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1">
                <span>To: {data.recipient_email}</span>
                <span>·</span>
                <span>{new Date(data.created_at).toLocaleString()}</span>
                {data.category && <Badge variant="outline" className="text-xs">{data.category}</Badge>}
                <Badge variant="secondary" className="text-xs">{data.status}</Badge>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {loading && (
              <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
            )}
            {error && (
              <div className="p-12 text-center text-sm text-muted-foreground">{error}</div>
            )}
            {data && (
              <iframe
                title="Email content"
                sandbox=""
                srcDoc={data.html}
                className="w-full bg-white"
                style={{ minHeight: "70vh", border: 0 }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}