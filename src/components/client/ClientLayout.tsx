import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Leaf, Home, ClipboardList, MessageSquare, LogOut, Copy, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIChatBox } from "@/components/AIChatBox";
import { ConnectionRequests } from "@/components/client/ConnectionRequests";
import { toast } from "sonner";

const navItems = [
  { title: "My Properties", url: "/client", icon: Home },
  { title: "My Service Visits", url: "/client/visits", icon: ClipboardList },
  { title: "Feedback & Requests", url: "/client/feedback", icon: MessageSquare },
];

export function ClientLayout() {
  const { signOut, profile } = useAuth();
  const location = useLocation();

  const copyId = () => {
    if (profile?.unique_client_id) {
      navigator.clipboard.writeText(profile.unique_client_id);
      toast.success("Client ID copied!");
    }
  };

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

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
            <div className="hidden md:block">
              <p className="text-sm font-medium leading-none">{profile?.full_name || "User"}</p>
              <button
                onClick={copyId}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title="Click to copy"
              >
                <span className="font-mono">{profile?.unique_client_id || "..."}</span>
                <Copy className="h-3 w-3" />
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
              </Button>
            </Link>
          ))}
        </nav>
        <Button variant="ghost" size="icon" onClick={signOut}>
          <LogOut className="h-4 w-4" />
        </Button>
      </header>
      {/* Mobile nav */}
      <nav className="md:hidden flex border-b bg-card">
        {navItems.map((item) => (
          <Link key={item.url} to={item.url} className="flex-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "w-full rounded-none gap-1 text-xs",
                location.pathname === item.url && "bg-primary/10 text-primary"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </Button>
          </Link>
        ))}
      </nav>
      <main className="flex-1 p-4 md:p-6 overflow-auto">
        <ConnectionRequests />
        <Outlet />
      </main>
      <AIChatBox />
    </div>
  );
}
