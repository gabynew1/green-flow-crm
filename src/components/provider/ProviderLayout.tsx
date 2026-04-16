import { useState } from "react";
import { Outlet, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ProviderSidebar } from "./ProviderSidebar";

import { useAuth } from "@/hooks/useAuth";
import { Plus, ClipboardCheck, FileOutput, LayoutDashboard, Sparkles } from "lucide-react";
import CreateAdHocVisitDialog from "./CreateAdHocVisitDialog";

export function ProviderLayout() {
  const { profile } = useAuth();
  const workspaceLabel = (profile as any)?.company_name || "Provider Workspace";
  const [quickVisitOpen, setQuickVisitOpen] = useState(false);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full flex-col md:flex-row">
        <ProviderSidebar />
        <div className="flex-1 flex flex-col pb-20 md:pb-0">
          <header className="h-14 flex items-center border-b px-4 bg-card sticky top-0 z-10">
            <SidebarTrigger className="mr-4" />
            <span className="text-sm font-medium text-muted-foreground">{workspaceLabel}</span>
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
          <button
            onClick={() => setQuickVisitOpen(true)}
            className="bg-primary text-primary-foreground p-3 rounded-full -mt-10 shadow-lg border-4 border-background"
          >
            <Plus className="h-6 w-6" />
          </button>
          <Link to="/provider/offers" className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary">
            <FileOutput className="h-5 w-5" />
            <span className="text-[10px]">Offers</span>
          </Link>
          <Link to="/provider/ai" className="flex flex-col items-center gap-1 text-muted-foreground hover:text-primary">
            <Sparkles className="h-5 w-5" />
            <span className="text-[10px]">AI</span>
          </Link>
        </div>

        <CreateAdHocVisitDialog open={quickVisitOpen} onOpenChange={setQuickVisitOpen} />

      </div>
    </SidebarProvider>
  );
}
