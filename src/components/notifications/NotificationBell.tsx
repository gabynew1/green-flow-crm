import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { items, unreadCount, markRead, markAllRead } = useNotifications(15);
  const { isProvider, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const tasksRoute = isSuperAdmin ? "/admin" : isProvider ? "/provider/tasks" : "/client/tasks";

  const handleOpen = (n: (typeof items)[number]) => {
    if (!n.read_at) markRead([n.id]);
    // Super admin routing: profile entities → global user management
    if (isSuperAdmin) {
      if (n.entity_type === "profile") {
        navigate("/admin/users");
        return;
      }
      navigate("/admin");
      return;
    }
    if (n.task_id) {
      navigate(`${tasksRoute}?task=${n.task_id}`);
    } else if (n.entity_type && n.entity_id) {
      // Best-effort entity routing
      const map: Record<string, string> = {
        offer: isProvider ? `/provider/offers/${n.entity_id}` : `/client/offers/${n.entity_id}`,
        contract: isProvider ? `/provider/contracts/${n.entity_id}` : `/client/contracts/${n.entity_id}`,
        inspection: isProvider ? `/provider/inspections/${n.entity_id}` : tasksRoute,
        feedback: isProvider ? "/provider/feedback" : "/client/feedback",
      };
      navigate(map[n.entity_type] ?? tasksRoute);
    } else {
      navigate(tasksRoute);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-xl" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAllRead()}>
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[60vh]">
          {items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No notifications yet</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleOpen(n)}
                    className={cn(
                      "block w-full px-4 py-3 text-left transition-colors hover:bg-muted/60",
                      !n.read_at && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight">{n.title}</p>
                      {!n.read_at && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    </div>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t px-4 py-2">
          <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate(tasksRoute)}>
            View all tasks
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}