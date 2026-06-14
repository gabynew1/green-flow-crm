import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { AIChatBox } from "@/components/AIChatBox";
import { ConnectionRequests } from "@/components/client/ConnectionRequests";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { toast } from "sonner";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";
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
import {
  ClipboardList,
  Copy,
  FileOutput,
  FileText,
  Home,
  Info,
  Leaf,
  Link2,
  LogOut,
  Menu,
  MessageSquare,
  Bell,
  UserCircle,
  X,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const buildNavItems = (t: (k: string) => string) => [
  { title: t("client:myProperties"), url: "/client", icon: Home, matchPaths: ["/client", "/client/properties"] },
  { title: t("client:offers"), url: "/client/offers", icon: FileOutput },
  { title: t("client:contracts"), url: "/client/contracts", icon: FileText, badgeKey: "contracts" as const },
  { title: t("client:tasks"), url: "/client/tasks", icon: Bell },
  { title: t("client:myVisits"), url: "/client/visits", icon: ClipboardList },
  { title: t("client:feedback"), url: "/client/feedback", icon: MessageSquare },
  { title: t("client:providers"), url: "/client/providers", icon: Building2, matchPaths: ["/client/providers", "/client/connect"] },
  { title: t("client:myProfile"), url: "/client/profile", icon: UserCircle },
];

export function ClientLayout() {
  const { signOut, profile, user } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  const navItems = buildNavItems(t);
  const [pendingContracts, setPendingContracts] = useState(0);
  const [showIdInfo, setShowIdInfo] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (user) {
      supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("status", "SENT_TO_CLIENT")
        .then(({ count }) => setPendingContracts(count ?? 0));
    }
  }, [user, location.pathname]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const confirmCopyId = () => {
    if (profile?.unique_client_id) {
      navigator.clipboard.writeText(profile.unique_client_id);
      toast.success("Client ID copied!");
    }
    setShowIdInfo(false);
  };

  const buildShareLink = () =>
    profile?.unique_client_id
      ? `${window.location.origin}/customers?connect=${profile.unique_client_id}`
      : "";

  const copyShareLink = () => {
    const link = buildShareLink();
    if (!link) return;
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied!");
  };

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((name) => name[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  const isActiveRoute = (url: string, matchPaths?: string[]) => {
    if (matchPaths) {
      return matchPaths.some(p => location.pathname === p || location.pathname.startsWith(`${p}/`));
    }
    return location.pathname === url || location.pathname.startsWith(`${url}/`);
  };

  const renderBadge = (badgeKey?: "contracts") => {
    if (badgeKey === "contracts" && pendingContracts > 0) {
      return (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
          {pendingContracts}
        </span>
      );
    }

    return null;
  };

  const NavItems = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={cn("flex gap-2", mobile ? "flex-col" : "flex-col") }>
      {navItems.map((item) => (
        <NavLink
          key={item.url}
          to={item.url}
          className={cn(
            "group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-sm font-medium text-muted-foreground transition-all",
            mobile ? "bg-background hover:bg-muted/60" : "hover:bg-muted/60"
          )}
          activeClassName="bg-primary/10 text-primary border-primary/20 shadow-sm"
        >
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground transition-colors",
              isActiveRoute(item.url, (item as any).matchPaths) && "border-primary/20 bg-primary/10 text-primary"
            )}
          >
            <item.icon className="h-4 w-4" />
          </span>
          <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <span className="truncate">{item.title}</span>
            {renderBadge(item.badgeKey)}
          </span>
        </NavLink>
      ))}
    </nav>
  );

  const ClientIdentityCard = ({ compact = false }: { compact?: boolean }) => (
    <div
      className={cn(
        "rounded-3xl border bg-card text-card-foreground shadow-sm",
        compact ? "p-4" : "p-5",
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-bold text-primary">
            {initials}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="text-lg font-semibold leading-tight text-foreground">
              {profile?.full_name || "Welcome"}
            </h1>
          </div>
        </div>

        <button
          onClick={() => setShowIdInfo(true)}
          className="flex w-full items-start justify-between gap-2 rounded-2xl border border-border bg-background px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="min-w-0 break-all leading-relaxed">
            Client number:{" "}
            <span className="font-mono font-semibold text-foreground">
              {profile?.unique_client_id || "..."}
            </span>
          </span>
          <Info className="h-4 w-4 shrink-0" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-[300px] shrink-0 border-r bg-muted/20 md:block">
          <div className="sticky top-0 flex h-screen flex-col gap-6 px-5 py-6">
            <Link to="/client" className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                <Leaf className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-foreground">GreenCRM</p>
                <p className="text-sm text-muted-foreground">{t("client:portalTitle")}</p>
              </div>
            </Link>

            <ClientIdentityCard />

            <div className="flex-1 overflow-y-auto pr-1">
              <NavItems />
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1 justify-start gap-2 rounded-2xl" onClick={signOut}>
                <LogOut className="h-4 w-4" />
                {t("actions.signOut")}
              </Button>
              <LanguageSwitcher />
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b bg-background/95 px-4 py-3 backdrop-blur md:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Button variant="outline" size="icon" className="rounded-xl" onClick={() => setMobileMenuOpen(true)}>
                  <Menu className="h-5 w-5" />
                </Button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{profile?.full_name || "Client portal"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {profile?.unique_client_id || "Loading client number..."}
                  </p>
                </div>
              </div>

              <Button variant="ghost" size="icon" className="rounded-xl" onClick={signOut}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
            <div className="absolute right-16 top-3 flex items-center gap-1">
              <LanguageSwitcher />
              <NotificationBell />
            </div>
          </header>

          {mobileMenuOpen && (
            <div className="fixed inset-0 z-40 md:hidden">
              <button
                className="absolute inset-0 bg-foreground/30"
                aria-label="Close menu"
                onClick={() => setMobileMenuOpen(false)}
              />
              <aside className="absolute left-0 top-0 flex h-full w-[88vw] max-w-[360px] flex-col gap-5 border-r bg-background px-4 py-4 shadow-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                      <Leaf className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold">GreenCRM</p>
                      <p className="text-sm text-muted-foreground">{t("client:portalTitle")}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => setMobileMenuOpen(false)}>
                    <X className="h-5 w-5" />
                  </Button>
                </div>

                <ClientIdentityCard compact />

                <div className="flex-1 overflow-y-auto pb-4">
                  <NavItems mobile />
                </div>

                <Button variant="outline" className="justify-start gap-2 rounded-2xl" onClick={signOut}>
                  <LogOut className="h-4 w-4" />
                  {t("actions.signOut")}
                </Button>
              </aside>
            </div>
          )}

          <main className="flex-1 px-4 py-4 md:px-8 md:py-8">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 md:gap-6">
              <div className="md:hidden">
                <ClientIdentityCard compact />
              </div>
              <ConnectionRequests />
              <div className="min-w-0">
                <Outlet />
              </div>
            </div>
          </main>
        </div>
      </div>

      <AIChatBox />

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
                  Your Unique Client Number is{" "}
                  <span className="font-mono font-semibold text-foreground">{profile?.unique_client_id}</span>.
                </p>
                <p>Share this number with a landscape provider to connect them to your account.</p>
                <div className="rounded-md border bg-muted/40 p-2">
                  <p className="mb-1 text-xs font-medium text-foreground">Or share a one-click invite link:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded bg-background px-2 py-1 text-[11px] font-mono text-foreground">
                      {buildShareLink()}
                    </code>
                    <Button size="sm" variant="outline" onClick={copyShareLink} className="h-7 shrink-0 gap-1">
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCopyId}>
              <Copy className="mr-1 h-4 w-4" /> Copy Number
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}