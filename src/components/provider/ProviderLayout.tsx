import { Outlet, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ProviderSidebar } from "./ProviderSidebar";
import { AIChatBox } from "@/components/AIChatBox";
import { Plus, ClipboardCheck, FileOutput, LayoutDashboard } from "lucide-react";

export function ProviderLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full flex-col md:flex-row">
        <ProviderSidebar />
        <div className="flex-1 flex flex-col pb-20 md:pb-0">
          <header className="h-14 flex items-center border-b px-4 bg-card sticky top-0 z-10">
            <SidebarTrigger className="mr-4" />
            <span className="text-sm font-medium text-muted-foreground">Provider Workspace</span>
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
