import { useEffect, useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Leaf, Home, ClipboardList, MessageSquare, LogOut, Copy, Info, UserCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIChatBox } from "@/components/AIChatBox";
import { ConnectionRequests } from "@/components/client/ConnectionRequests";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const navItems = [
  { title: "My Properties", url: "/client", icon: Home },
  { title: "Contracts", url: "/client/contracts", icon: FileText, badgeKey: "contracts" as const },
  { title: "My Service Visits", url: "/client/visits", icon: ClipboardList },
  { title: "Feedback & Requests", url: "/client/feedback", icon: MessageSquare },
  { title: "My Profile", url: "/client/profile", icon: UserCircle },
];

export function ClientLayout() {
  const { signOut, profile, user } = useAuth();
  const location = useLocation();
  const [pendingContracts, setPendingContracts] = useState(0);
  const [showIdInfo, setShowIdInfo] = useState(false);

  useEffect(() => {
    if (user) {
      supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("status", "PENDING_NEW")
        .then(({ count }) => setPendingContracts(count ?? 0));
    }
  }, [user, location.pathname]);

  const confirmCopyId = () => {
    if (profile?.unique_client_id) {
      navigator.clipboard.writeText(profile.unique_client_id);
      toast.success("Client ID copied!");
    }
    setShowIdInfo(false);
  };

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  const renderNavBadge = (item: typeof navItems[0]) => {
    if (item.badgeKey === "contracts" && pendingContracts > 0) {
      return (
        <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
          {pendingContracts}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 flex items-center justify-between border-b px-4 bg-card">
        <div className="flex items-center gap-3">
          <Leaf className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground hidden sm:inline">GreenCRM</span>
          <div className="h-6 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
              {initials}
            </div>
            <div className="hidden md:flex items-center gap-2">
              <p className="text-sm font-medium leading-none">{profile?.full_name || "User"}</p>
              <span className="text-muted-foreground">·</span>
              <button
                onClick={() => setShowIdInfo(true)}
                className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                title="Click for details"
              >
                <span className="text-muted-foreground">Unique Client Number:</span>
                <span className="font-mono font-semibold text-foreground">{profile?.unique_client_id || "..."}</span>
              </button>
            </div>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link key={item.url} to={item.url}>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "gap-2",
                  location.pathname === item.url && "bg-primary/10 text-primary"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
                {renderNavBadge(item)}
              </Button>
            </Link>
          ))}
        </nav>
        <Button variant="ghost" size="icon" onClick={signOut}>
          <LogOut className="h-4 w-4" />
        </Button>
      </header>
      {/* Mobile nav — icons only on small screens */}
      <nav className="md:hidden flex border-b bg-card">
        {navItems.map((item) => (
          <Link key={item.url} to={item.url} className="flex-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "w-full rounded-none flex flex-col gap-0.5 h-auto py-2 px-1",
                location.pathname === item.url && "bg-primary/10 text-primary"
              )}
            >
              <span className="relative">
                <item.icon className="h-4 w-4" />
                {item.badgeKey === "contracts" && pendingContracts > 0 && (
                  <span className="absolute -top-1 -right-2 h-3 min-w-[12px] px-0.5 rounded-full bg-destructive text-destructive-foreground text-[8px] font-bold flex items-center justify-center">
                    {pendingContracts}
                  </span>
                )}
              </span>
              <span className="text-[10px] leading-tight truncate max-w-full">{item.title}</span>
            </Button>
          </Link>
        ))}
      </nav>
      <main className="flex-1 p-4 md:p-6 overflow-auto">
        <ConnectionRequests />
        <Outlet />
      </main>
      <AIChatBox />

      {/* Client ID Info Dialog */}
      <AlertDialog open={showIdInfo} onOpenChange={setShowIdInfo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Unique Client Number
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Your Unique Client Number is <span className="font-mono font-semibold text-foreground">{profile?.unique_client_id}</span>.</p>
                <p>Share this number with a landscape provider to connect them to your account.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCopyId}>
              <Copy className="h-4 w-4 mr-1" /> Copy Number
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
