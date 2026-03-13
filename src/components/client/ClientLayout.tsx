import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Leaf, Home, ClipboardList, MessageSquare, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIChatBox } from "@/components/AIChatBox";

const navItems = [
  { title: "My Properties", url: "/client", icon: Home },
  { title: "My Service Visits", url: "/client/visits", icon: ClipboardList },
  { title: "Feedback & Requests", url: "/client/feedback", icon: MessageSquare },
];

export function ClientLayout() {
  const { signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 flex items-center justify-between border-b px-4 bg-card">
        <div className="flex items-center gap-2">
          <Leaf className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">GreenCRM</span>
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
        <Outlet />
      </main>
      <AIChatBox />
    </div>
  );
}
