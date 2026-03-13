import {
  LayoutDashboard,
  Users,
  FileText,
  ClipboardList,
  BookOpen,
  MessageSquare,
  Leaf,
  LogOut,
  Shield,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "Dashboard", url: "/provider", icon: LayoutDashboard },
  { title: "Customers & Properties", url: "/provider/customers", icon: Users },
  { title: "Contracts", url: "/provider/contracts", icon: FileText },
  { title: "Service Visits", url: "/provider/visits", icon: ClipboardList },
  { title: "Service Catalog", url: "/provider/catalog", icon: BookOpen },
  { title: "Feedback", url: "/provider/feedback", icon: MessageSquare },
];

export function ProviderSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut, profile, isSuperAdmin } = useAuth();

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <div className="flex items-center gap-2">
              <Leaf className="h-4 w-4 text-sidebar-primary" />
              {!collapsed && <span className="font-semibold">GreenCRM</span>}
            </div>
          </SidebarGroupLabel>
          {!collapsed && (
            <div className="px-3 py-2 mb-1">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-sidebar-primary/10 flex items-center justify-center text-xs font-bold text-sidebar-primary">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate text-sidebar-foreground">{profile?.full_name || "User"}</p>
                  <p className="text-[10px] text-sidebar-foreground/50 truncate">{profile?.email}</p>
                </div>
              </div>
            </div>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/provider"}
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin"
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <Shield className="mr-2 h-4 w-4" />
                      {!collapsed && <span>Admin</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
