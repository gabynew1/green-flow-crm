import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, Bot, UserPlus, LogOut, Users, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Overview = {
  days: number;
  page_views_human: number;
  page_views_bot: number;
  unique_visitors: number;
  signups_started: number;
  signups_completed: number;
  signups_abandoned: number;
  abandon_by_step: { step: string; count: number }[];
  daily: { day: string; human: number; bot: number }[];
  top_paths: { path: string; views: number }[];
  new_accounts: {
    user_id: string;
    full_name: string | null;
    email: string | null;
    company_name: string | null;
    tenant_name: string | null;
    tier: string | null;
    kind: "provider" | "client";
    created_at: string;
  }[];
  new_accounts_count: number;
  new_companies_count: number;
};

const RANGES = [7, 30, 90];

const Stat = ({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: any;
  tone?: "default" | "warning" | "success";
}) => (
  <div className="rounded-xl border border-primary/10 p-4 bg-background">
    <div className="flex items-center justify-between">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <Icon
        className={
          tone === "warning"
            ? "h-4 w-4 text-destructive"
            : tone === "success"
              ? "h-4 w-4 text-green-600"
              : "h-4 w-4 text-primary"
        }
      />
    </div>
    <p className="text-2xl font-bold mt-2">{value}</p>
    {sub && <p className="text-xs text-muted-foreground font-medium mt-1">{sub}</p>}
  </div>
);

export default function AcquisitionPanel() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-acquisition", days],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_analytics_overview", { _days: days });
      if (error) throw error;
      return data as Overview;
    },
  });

  const maxDaily = Math.max(1, ...(data?.daily ?? []).map((d) => d.human + d.bot));
  const started = data?.signups_started ?? 0;
  const completed = data?.signups_completed ?? 0;
  const abandoned = data?.signups_abandoned ?? 0;
  const completionRate = started > 0 ? Math.round((completed / started) * 100) : 0;

  return (
    <Card className="border-primary/10">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Traffic &amp; Signup Funnel
        </CardTitle>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={days === r ? "default" : "outline"}
              onClick={() => setDays(r)}
            >
              {r}d
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Human page views"
                value={data?.page_views_human ?? 0}
                sub={`${data?.unique_visitors ?? 0} unique visitors`}
                icon={Eye}
              />
              <Stat
                label="Bot page views"
                value={data?.page_views_bot ?? 0}
                sub="Excluded from human metrics"
                icon={Bot}
                tone="warning"
              />
              <Stat
                label="Signups started"
                value={started}
                sub={`${completed} finished · ${completionRate}% completion`}
                icon={UserPlus}
              />
              <Stat
                label="Abandoned signups"
                value={abandoned}
                sub="Started the wizard, never finished"
                icon={LogOut}
                tone={abandoned > 0 ? "warning" : "success"}
              />
            </div>

            {/* Daily traffic */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Daily page views (human vs bot)
              </p>
              {data?.daily?.length ? (
                <div className="flex items-end gap-1 h-28">
                  {data.daily.map((d) => (
                    <div key={d.day} className="flex-1 flex flex-col justify-end group relative">
                      <div
                        className="w-full bg-muted rounded-t-sm"
                        style={{ height: `${(d.bot / maxDaily) * 100}%` }}
                        title={`${d.bot} bot views`}
                      />
                      <div
                        className="w-full bg-primary rounded-t-sm"
                        style={{ height: `${(d.human / maxDaily) * 100}%` }}
                        title={`${d.human} human views`}
                      />
                      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground opacity-0 group-hover:opacity-100 whitespace-nowrap">
                        {d.day.slice(5)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">No traffic recorded yet.</p>
              )}
              <div className="flex gap-4 mt-7 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-primary" /> Human
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-muted" /> Bot
                </span>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Drop-off */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Where people drop off
                </p>
                {data?.abandon_by_step?.length ? (
                  <div className="space-y-2">
                    {data.abandon_by_step.map((s) => (
                      <div key={s.step} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{s.step}</span>
                        <span className="font-semibold">{s.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No abandoned signups in this period.</p>
                )}

                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-6 mb-3">
                  Most visited pages
                </p>
                {data?.top_paths?.length ? (
                  <div className="space-y-2">
                    {data.top_paths.map((p) => (
                      <div key={p.path} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground truncate mr-3">{p.path}</span>
                        <span className="font-semibold">{p.views}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No page views yet.</p>
                )}
              </div>

              {/* New accounts */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  New accounts ({data?.new_accounts_count ?? 0} people · {data?.new_companies_count ?? 0} companies)
                </p>
                {data?.new_accounts?.length ? (
                  <div className="space-y-2 max-h-80 overflow-auto pr-1">
                    {data.new_accounts.map((a) => (
                      <div
                        key={a.user_id}
                        className="flex items-start justify-between gap-3 p-2 rounded-lg hover:bg-muted/50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {a.full_name || a.email || "Unnamed user"}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {a.company_name || a.tenant_name || "—"}
                            {a.email ? ` · ${a.email}` : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <Badge variant={a.kind === "provider" ? "default" : "secondary"} className="text-[10px]">
                            {a.kind}
                            {a.tier ? ` · ${a.tier}` : ""}
                          </Badge>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No new accounts in this period.</p>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
