import { Outlet, Link, useLocation } from "react-router-dom";
import {
    Shield,
    LayoutDashboard,
    Building2,
    Users,
    History,
    ScrollText,
    LogOut,
    Bell,
    Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const AdminLayout = () => {
    const location = useLocation();
    const { signOut } = useAuth();

    const menuItems = [
        { icon: LayoutDashboard, label: "Dashboard", path: "/admin" },
        { icon: Building2, label: "Tenants", path: "/admin/tenants" },
        { icon: Users, label: "Global Users", path: "/admin/users" },
        { icon: ScrollText, label: "Audit Logs", path: "/admin/audit" },
        { icon: Shield, label: "Security", path: "/admin/security" },
    ];

    return (
        <div className="flex min-h-screen bg-background">
            {/* Sidebar */}
            <aside className="w-64 border-r bg-card flex flex-col fixed inset-y-0 shadow-sm z-20">
                <div className="p-6 flex items-center gap-3 border-b bg-primary/5">
                    <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                        <Shield className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight">SuperHub</h1>
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Green Flow Admin</p>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {menuItems.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group",
                                location.pathname === item.path
                                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/10"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                        >
                            <item.icon className={cn(
                                "h-5 w-5 transition-transform duration-200 group-hover:scale-110",
                                location.pathname === item.path ? "text-primary-foreground" : "text-muted-foreground"
                            )} />
                            {item.label}
                        </Link>
                    ))}
                </nav>

                <div className="p-4 border-t space-y-2 mt-auto bg-muted/50">
                    <Button
                        variant="ghost"
                        className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                        onClick={() => signOut()}
                    >
                        <LogOut className="h-5 w-5 mr-3" />
                        Sign Out
                    </Button>
                    <div className="px-4 py-3 bg-card rounded-lg border shadow-sm">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter mb-1">Status</p>
                        <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-xs font-semibold">System Optimal</span>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-64 min-h-screen flex flex-col">
                {/* Header */}
                <header className="h-16 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10 flex items-center justify-between px-8 shadow-sm">
                    <div className="flex items-center gap-4 flex-1 max-w-md">
                        <div className="relative w-full group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                            <input
                                placeholder="Global search (Tenant, User, Serial...)"
                                className="w-full bg-muted/50 border-none rounded-full py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/20 focus:bg-background transition-all"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="h-5 w-5" />
                            <span className="absolute top-2 right-2 h-2 w-2 bg-destructive rounded-full border-2 border-background" />
                        </Button>
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center border text-[10px] font-bold">
                            SA
                        </div>
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 p-8 bg-[#F9FAFB]">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
