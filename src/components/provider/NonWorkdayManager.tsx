import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CalendarOff, Plus, Trash2, Sun } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useWorkdays, type GlobalHoliday, type TenantNonWorkday } from "@/hooks/useWorkdays";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";

interface Props {
  tenantId: string | null;
}

export default function NonWorkdayManager({ tenantId }: Props) {
  const { holidays, tenantNonWorkdays, loading, addNonWorkday, removeNonWorkday } = useWorkdays(tenantId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const currentYear = new Date().getFullYear();
  const upcomingHolidays = holidays.filter(h => {
    const y = parseInt(h.date.split("-")[0]);
    return y >= currentYear;
  });

  const handleAdd = async () => {
    if (!newDate || !newTitle.trim()) {
      toast.error("Please provide a date and title");
      return;
    }
    setSaving(true);
    try {
      await addNonWorkday(newDate, newTitle.trim());
      toast.success("Non-workday added");
      setNewDate("");
      setNewTitle("");
      setDialogOpen(false);
    } catch (e: any) {
      if (e?.code === "23505") {
        toast.error("This date is already blocked");
      } else {
        toast.error("Failed to add non-workday");
      }
    }
    setSaving(false);
  };

  const handleRemove = async (id: string) => {
    try {
      await removeNonWorkday(id);
      toast.success("Non-workday removed");
    } catch {
      toast.error("Failed to remove");
    }
  };

  const formatDate = (d: string) => {
    try { return format(parseISO(d), "EEE, MMM d, yyyy"); } catch { return d; }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarOff className="h-5 w-5 text-primary" />
            <CardTitle>Workday Settings</CardTitle>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" /> Add Non-Workday
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Custom Non-Workday</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Orthodox Easter" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAdd} disabled={saving}>
                  {saving ? "Adding…" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <CardDescription>
          Sundays and bank holidays are automatically non-workdays. Add custom blocked dates below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Custom non-workdays */}
        {tenantNonWorkdays.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Custom Non-Workdays</p>
            <div className="space-y-1">
              {tenantNonWorkdays.map(d => (
                <div key={d.id} className="flex items-center justify-between rounded-lg border p-2.5 px-3">
                  <div className="flex items-center gap-2">
                    <CalendarOff className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium">{d.title}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(d.date)}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemove(d.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tenantNonWorkdays.length === 0 && (
          <p className="text-sm text-muted-foreground">No custom non-workdays added yet.</p>
        )}

        {/* Global holidays reference */}
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Sun className="h-4 w-4 text-warning" /> Bank Holidays (Romania)
          </p>
          <div className="grid gap-1 max-h-[240px] overflow-y-auto">
            {upcomingHolidays.map(h => (
              <div key={h.id} className="flex items-center gap-2 rounded px-3 py-1.5 bg-muted/50 text-sm">
                <Badge variant="outline" className="text-[10px] font-mono">
                  {h.date}
                </Badge>
                <span>{h.name}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
