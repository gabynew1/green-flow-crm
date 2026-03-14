import { Outlet, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ProviderSidebar } from "./ProviderSidebar";
import { AIChatBox } from "@/components/AIChatBox";
import { Plus, ClipboardCheck, FileOutput, LayoutDashboard, Crown, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { differenceInDays } from "date-fns";

export function ProviderLayout() {
  const { user } = useAuth();

  const { data: tenant } = useQuery({
    queryKey: ["current-tenant", user?.id],
    queryFn: async () => {
      if (!user) return null;
      // Get the user's profile to find their tenant_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (!profile?.tenant_id) return null;

      const { data: tenantData } = await supabase
        .from('tenants')
        .select('subscription_tier, status, trial_expires_at')
        .eq('id', profile.tenant_id)
        .single();

      return tenantData;
    },
    enabled: !!user
  });

  const renderTrialWidget = () => {
    if (!tenant) return null;

    if (tenant.status === 'TRIAL' && tenant.trial_expires_at) {
      const daysLeft = differenceInDays(new Date(tenant.trial_expires_at), new Date());
      if (daysLeft < 0) {
        return (
          <div className="flex items-center gap-2 bg-destructive/10 text-destructive text-xs font-semibold px-3 py-1 rounded-full ml-auto border border-destructive/20">
            <AlertTriangle className="h-3 w-3" />
            Trial Expired - Basic Tier Defaulted
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2 bg-amber-500/10 text-amber-600 outline outline-1 outline-amber-500/20 text-xs font-semibold px-3 py-1 rounded-full ml-auto shadow-sm">
          <Crown className="h-3 w-3 text-amber-500" />
          Platinum Trial - {daysLeft} Days Left
        </div>
      );
    }
    return null;
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full flex-col md:flex-row bg-background">
        <ProviderSidebar />
        <div className="flex-1 flex flex-col pb-20 md:pb-0 relative max-h-screen">
          <header className="h-14 shrink-0 flex items-center border-b px-4 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 sticky top-0 z-40">
            <SidebarTrigger className="mr-4" />
            <span className="text-sm font-semibold text-foreground tracking-tight hidden sm:inline-block">Provider Workspace</span>
            {renderTrialWidget()}
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            <Outlet />
          </main>
        </div>

        {/* Mobile Quick Actions / Bottom Nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex items-center justify-around px-4 z-50">
          <Link to="/provider" className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary">
            <LayoutDashboard className="h-5 w-5" />
            <span className="text-[10px]">Home</span>
          </Link>
          <Link to="/provider/pipeline" className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary">
            <ClipboardCheck className="h-5 w-5" />
            <span className="text-[10px]">Pipeline</span>
          </Link>
          <div className="bg-primary text-primary-foreground p-3 rounded-full -mt-10 shadow-lg border-4 border-background">
            <Plus className="h-6 w-6" />
          </div>
          <Link to="/provider/offers" className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary">
            <FileOutput className="h-5 w-5" />
            <span className="text-[10px]">Offers</span>
          </Link>
          <AIChatBox mobileTriggerOnly />
        </div>

        <div className="hidden md:block">
          <AIChatBox />
        </div>
      </div>
    </SidebarProvider>
  );
}
