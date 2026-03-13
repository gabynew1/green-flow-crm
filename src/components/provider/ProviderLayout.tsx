import { Outlet } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ProviderSidebar } from "./ProviderSidebar";
import { AIChatBox } from "@/components/AIChatBox";

export function ProviderLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <ProviderSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b px-4 bg-card">
            <SidebarTrigger className="mr-4" />
            <span className="text-sm font-medium text-muted-foreground">Provider Workspace</span>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
        <AIChatBox />
      </div>
    </SidebarProvider>
  );
}
