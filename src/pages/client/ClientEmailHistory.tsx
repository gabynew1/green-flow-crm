import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmailHistoryTable, type EmailHistoryRow } from "@/components/EmailHistoryTable";
import { ArrowLeft, Mail, Info } from "lucide-react";

const RANGES = [
  { v: "7", label: "Last 7 days" },
  { v: "30", label: "Last 30 days" },
  { v: "90", label: "Last 90 days" },
  { v: "365", label: "Last year" },
];

export default function ClientEmailHistory() {
  const [rows, setRows] = useState<EmailHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("all");
  const [days, setDays] = useState<string>("90");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const since = new Date(Date.now() - parseInt(days, 10) * 86400000).toISOString();
      const { data, error } = await supabase.rpc("get_my_email_history", {
        _limit: 200,
        _offset: 0,
        _category: category === "all" ? null : category,
        _since: since,
      });
      if (cancelled) return;
      if (!error && data) setRows(data as EmailHistoryRow[]);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [category, days]);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/client/profile"><ArrowLeft className="h-4 w-4 mr-2" />Back to Profile</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email history
          </CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" />
            Emails are kept for 1 year, then permanently deleted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="account">Account</SelectItem>
                <SelectItem value="visits">Visits</SelectItem>
                <SelectItem value="contracts_offers">Contracts & offers</SelectItem>
                <SelectItem value="inspections">Inspections</SelectItem>
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => <SelectItem key={r.v} value={r.v}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <EmailHistoryTable rows={rows} loading={loading} />
        </CardContent>
      </Card>
    </div>
  );
}