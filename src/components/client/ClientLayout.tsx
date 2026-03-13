import { Outlet, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Leaf, Home, ClipboardList, MessageSquare, LogOut, Copy, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { AIChatBox } from "@/components/AIChatBox";
import { ConnectionRequests } from "@/components/client/ConnectionRequests";
import { toast } from "sonner";
import { useState } from "react";
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
  { title: "My Service Visits", url: "/client/visits", icon: ClipboardList },
  { title: "Feedback & Requests", url: "/client/feedback", icon: MessageSquare },
];

export function ClientLayout() {
  const { signOut, profile } = useAuth();
  const location = useLocation();

  const [showCopyWarning, setShowCopyWarning] = useState(false);
  const [showIdInfo, setShowIdInfo] = useState(false);

  const confirmCopyId = () => {
    if (profile?.unique_client_id) {
      navigator.clipboard.writeText(profile.unique_client_id);
      toast.success("Client ID copied!");
    }
    setShowCopyWarning(false);
    setShowIdInfo(false);
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
                <p>
                  Your Unique Client Number is <span className="font-mono font-semibold text-foreground">{profile?.unique_client_id}</span>.
                </p>
                <p>
                  Share this number with a landscape provider to connect them to your account. Once connected, the provider can manage service visits, update green inventory, and maintain contracts for your properties.
                </p>
                <p className="text-destructive/80 font-medium">
                  ⚠️ Sharing this number will give the provider access to <strong>all your properties</strong> that are not already connected at the property level with another provider. To share a single property, use the Property ID instead.
                </p>
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
