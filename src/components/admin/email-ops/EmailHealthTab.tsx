import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function EmailHealthTab() {
  const q = useQuery({
    queryKey: ["email-health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_email_health");
      if (error) throw error;
      return data as any;
    },
    refetchInterval: 15_000,
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading health…
      </div>
    );
  }

  const data = q.data ?? {};
  const queues = data.queues ?? {};
  const throughput = data.throughput ?? {};
  const cron = data.cron_jobs ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Throughput */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Last 24h total</p>
          <p className="text-2xl font-bold">{throughput.last_24h_total ?? 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Last 24h sent</p>
          <p className="text-2xl font-bold text-emerald-600">{throughput.last_24h_sent ?? 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Last 24h failed</p>
          <p className="text-2xl font-bold text-red-600">{throughput.last_24h_failed ?? 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase">Last 1h</p>
          <p className="text-2xl font-bold">{throughput.last_1h_total ?? 0}</p>
        </CardContent></Card>
      </div>

      {/* Queue depths */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Queue depths</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {Object.keys(queues).length === 0 && (
            <p className="text-sm text-muted-foreground">No queue data available.</p>
          )}
          {Object.entries(queues).map(([name, m]: any) => {
            const isDLQ = name.endsWith("_dlq");
            const len = m?.queue_length ?? 0;
            return (
              <div key={name} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-mono text-sm">{name}</p>
                  <p className="text-xs text-muted-foreground">
                    Total processed: {m?.total_messages ?? 0}
                  </p>
                </div>
                <Badge variant="outline" className={
                  isDLQ && len > 0
                    ? "bg-red-500/10 text-red-700 border-red-500/30"
                    : len > 50
                      ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
                      : "bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                }>
                  {len} pending
                </Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Cron jobs */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Scheduled jobs</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {cron.length === 0 && (
            <p className="text-sm text-red-600">No cron jobs found — emails will not be processed.</p>
          )}
          {cron.map((job: any) => (
            <div key={job.jobname} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="font-mono text-sm">{job.jobname}</p>
                <p className="text-xs text-muted-foreground">Schedule: {job.schedule}</p>
              </div>
              {job.active
                ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Active
                  </Badge>
                : <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/30">
                    <XCircle className="h-3 w-3 mr-1" /> Inactive
                  </Badge>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}