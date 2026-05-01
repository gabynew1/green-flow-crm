import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Users2, Lock, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { useTenantSubscription } from "@/hooks/useTenantSubscription";
import { getTierConfig } from "@/lib/tiers";

interface Team {
  id: string;
  name: string;
  color: string;
  tenant_id: string;
  memberCount: number;
}

interface StaffMember {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

const TEAM_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316", "#6366F1", "#14B8A6",
];

export default function TeamManager({ tenantId }: { tenantId: string | null }) {
  const { user } = useAuth();
  const { data: tenant } = useTenantSubscription();
  const [teams, setTeams] = useState<Team[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamColor, setTeamColor] = useState(TEAM_COLORS[0]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteTeam, setDeleteTeam] = useState<Team | null>(null);

  useEffect(() => {
    if (tenantId) loadTeams();
  }, [tenantId]);

  const loadTeams = async () => {
    if (!tenantId) return;
    setLoading(true);

    const [teamsRes, membersRes, staffRes] = await Promise.all([
      supabase.from("teams").select("*").eq("tenant_id", tenantId).order("created_at"),
      supabase.from("team_members").select("*"),
      supabase.from("profiles").select("user_id, full_name, email").eq("tenant_id", tenantId),
    ]);

    const allMembers = membersRes.data ?? [];
    const teamsList = (teamsRes.data ?? []).map((t: any) => ({
      ...t,
      memberCount: allMembers.filter((m: any) => m.team_id === t.id).length,
    }));

    setTeams(teamsList);
    setStaff((staffRes.data as StaffMember[]) ?? []);
    setLoading(false);
  };

  const openCreate = () => {
    setEditingTeam(null);
    setTeamName("");
    const usedColors = new Set(teams.map(t => t.color));
    setTeamColor(TEAM_COLORS.find(c => !usedColors.has(c)) || TEAM_COLORS[0]);
    setSelectedMembers([]);
    setDialogOpen(true);
  };

  const openEdit = async (team: Team) => {
    setEditingTeam(team);
    setTeamName(team.name);
    setTeamColor(team.color);

    const { data } = await supabase.from("team_members").select("user_id").eq("team_id", team.id);
    setSelectedMembers((data ?? []).map((m: any) => m.user_id));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!teamName.trim()) { toast.error("Team name is required"); return; }
    if (selectedMembers.length === 0) { toast.error("Minimum 1 member per team"); return; }
    if (!tenantId) return;

    setSaving(true);
    try {
      if (editingTeam) {
        // Update team
        await supabase.from("teams").update({ name: teamName.trim(), color: teamColor } as any).eq("id", editingTeam.id);

        // Sync members: delete all, re-insert
        await supabase.from("team_members").delete().eq("team_id", editingTeam.id);
        const inserts = selectedMembers.map(uid => ({ team_id: editingTeam.id, user_id: uid }));
        if (inserts.length > 0) {
          await supabase.from("team_members").insert(inserts);
        }
        toast.success("Team updated");
      } else {
        // Create team
        const { data: newTeam, error } = await supabase
          .from("teams")
          .insert({ tenant_id: tenantId, name: teamName.trim(), color: teamColor })
          .select()
          .single();
        if (error) throw error;

        const inserts = selectedMembers.map(uid => ({ team_id: newTeam.id, user_id: uid }));
        if (inserts.length > 0) {
          await supabase.from("team_members").insert(inserts);
        }
        toast.success("Team created");
      }
      setDialogOpen(false);
      loadTeams();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTeam) return;
    if (teams.length <= 1) { toast.error("Cannot delete the last team"); return; }

    // Check if team has visits assigned
    const { count } = await supabase
      .from("service_orders")
      .select("id", { count: "exact", head: true })
      .eq("team_id", deleteTeam.id);

    if (count && count > 0) {
      toast.error(`Cannot delete: ${count} visits are assigned to this team. Reassign them first.`);
      setDeleteTeam(null);
      return;
    }

    await supabase.from("team_members").delete().eq("team_id", deleteTeam.id);
    await supabase.from("teams").delete().eq("id", deleteTeam.id);
    toast.success("Team deleted");
    setDeleteTeam(null);
    loadTeams();
  };

  const toggleMember = (uid: string) => {
    setSelectedMembers(prev => prev.includes(uid) ? prev.filter(m => m !== uid) : [...prev, uid]);
  };

  if (loading) return null;

  const maxTeams = tenant?.max_teams ?? 999;
  const tierName = getTierConfig(tenant?.subscription_tier).name;
  const overLimit = teams.length > maxTeams;
  const atLimit = teams.length >= maxTeams;
  // Lock the newest excess teams when over limit (keep oldest active)
  const lockedTeamIds = new Set(
    overLimit ? teams.slice(maxTeams).map((t) => t.id) : []
  );

  return (
    <>
      {overLimit && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900">
              {teams.length - maxTeams} team{teams.length - maxTeams === 1 ? "" : "s"} over your {tierName} limit
            </p>
            <p className="text-amber-800 mt-0.5">
              Excess teams are read-only. <Link to="/pricing" className="font-semibold underline">Upgrade</Link> or remove teams to unlock them.
            </p>
          </div>
        </div>
      )}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users2 className="h-5 w-5 text-primary" />
              <CardTitle>Teams</CardTitle>
              <span className="text-xs text-muted-foreground font-normal">
                ({teams.length}/{maxTeams === 999 ? "∞" : maxTeams})
              </span>
            </div>
            <Button
              size="sm"
              onClick={openCreate}
              disabled={atLimit}
              title={atLimit ? `Upgrade to add more teams (${tierName} allows ${maxTeams})` : ""}
            >
              <Plus className="mr-1 h-4 w-4" /> Add Team
            </Button>
          </div>
          <CardDescription>
            Organize your staff into teams. Each team has its own calendar and capacity.
            {atLimit && !overLimit && (
              <span className="block mt-1 text-amber-700 font-medium">
                You've reached the {tierName} limit. <Link to="/pricing" className="underline">Upgrade</Link> for more.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {teams.map(team => {
              const locked = lockedTeamIds.has(team.id);
              return (
                <div key={team.id} className={`flex items-center justify-between rounded-lg border p-3 ${locked ? "bg-stone-50 border-amber-200" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full border-2" style={{ backgroundColor: team.color, borderColor: team.color }} />
                    <div>
                      <p className="text-sm font-medium flex items-center gap-1.5">
                        {team.name}
                        {locked && (
                          <Badge variant="outline" className="text-amber-800 border-amber-300 bg-amber-50 text-[10px] py-0">
                            <Lock className="h-2.5 w-2.5 mr-0.5" /> Locked
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{team.memberCount} member{team.memberCount !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(team)} disabled={locked}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {teams.length > 1 && (
                      <Button size="icon" variant="ghost" onClick={() => setDeleteTeam(team)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTeam ? "Edit Team" : "Create Team"}</DialogTitle>
            <DialogDescription>
              {editingTeam ? "Update team name, color, and members." : "Set up a new team with members."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Team Name</Label>
              <Input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="e.g. Team B" />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {TEAM_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`h-8 w-8 rounded-full border-2 transition-transform ${teamColor === c ? "scale-110 border-foreground" : "border-transparent hover:scale-105"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setTeamColor(c)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Members <span className="text-xs text-muted-foreground font-normal">(minimum 1)</span></Label>
              <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-1">
                {staff.map(s => (
                  <label key={s.user_id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                    <Checkbox
                      checked={selectedMembers.includes(s.user_id)}
                      onCheckedChange={() => toggleMember(s.user_id)}
                    />
                    <span className="flex-1">{s.full_name || s.email || "Unknown"}</span>
                  </label>
                ))}
                {staff.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No staff found</p>}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingTeam ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTeam} onOpenChange={open => !open && setDeleteTeam(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team "{deleteTeam?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the team and all member assignments. Visits assigned to this team will be unassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
