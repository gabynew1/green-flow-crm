import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Gauge, Bug, Timer } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const RANGES = [1, 7, 30];

const ENDPOINT_LABEL: Record<string, string> = {
  "create-manual-user": "Signup",
  "request-password-reset": "Password reset",
  "ai-assistant": "AI assistant",
};

const REASON_LABEL: Record<string, string> = {
  rate_limited: "Rate limited",
  honeypot: "Honeypot triggered",
  too_fast: "Submitted too fast",
};

type BlockRow = {
  created_at: string;
  path: string | null;
  meta: Record<string, unknown> | null;
};

const Stat = ({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: any;
}) => (
  <div className="rounded-xl border border-primary/10 p-4 bg-background">
    <div className="flex items-center justify-between">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <Icon className="h-4 w-4 text-primary" />
    </div>
    <p className="text-2xl font-bold mt-2">{value}</p>
    {sub && <p className="text-xs text-muted-foreground font-medium mt-1">{sub}</p>}
  </div>
);

export default function AbusePanel() {
  const [days, setDays] = useState(7);

  const { data, isLoading } = useQuery({
    queryKey: ["abuse-blocks", days],
    queryFn: async () => {
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("analytics_events")
        .select("created_at, path, meta")
        .eq("event_name", "abuse_block")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as BlockRow[];
    },
    staleTime: 60_000,
  });

  const rows = data ?? [];
  const reasonOf = (r: BlockRow) => String(r.meta?.reason ?? "unknown");
  const endpointOf = (r: BlockRow) => String(r.meta?.endpoint ?? r.path ?? "unknown");

  const rateLimited = rows.filter((r) => reasonOf(r) === "rate_limited").length;
  const botFriction = rows.filter((r) => reasonOf(r) === "honeypot" || reasonOf(r) === "too_fast").length;
  const aiBlocks = rows.filter((r) => endpointOf(r) === "ai-assistant").length;

  const byEndpoint = rows.reduce<Record<string, number>>((acc, r) => {
    const key = endpointOf(r);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Card className="border-primary/10">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          Abuse &amp; serverless
        </CardTitle>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={days === r ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setDays(r)}
            >
              {r}d
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Blocked requests" value={rows.length} sub={`Last ${days} day(s)`} icon={ShieldAlert} />
              <Stat label="Rate limited" value={rateLimited} sub="Burst limiter rejections" icon={Gauge} />
              <Stat label="Bot friction" value={botFriction} sub="Honeypot / too fast" icon={Bug} />
              <Stat label="AI endpoint" value={aiBlocks} sub="Blocked before model call" icon={Timer} />
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No blocked requests in this window — the public endpoints are quiet.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(byEndpoint).map(([endpoint, count]) => (
                    <Badge key={endpoint} variant="secondary" className="font-medium">
                      {ENDPOINT_LABEL[endpoint] ?? endpoint}: {count}
                    </Badge>
                  ))}
                </div>

                <div className="rounded-xl border border-primary/10 divide-y">
                  {rows.slice(0, 15).map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="font-medium">
                        {ENDPOINT_LABEL[endpointOf(r)] ?? endpointOf(r)}
                      </span>
                      <span className="text-muted-foreground">
                        {REASON_LABEL[reasonOf(r)] ?? reasonOf(r)}
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <p className="text-xs text-muted-foreground">
              Burst limits run in-memory at the edge, so blocked traffic never reaches the database.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
