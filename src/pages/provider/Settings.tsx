import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Building2, Users, Plus, Mail, Shield, ShieldCheck, Copy, AlertTriangle, Plug, Link2 } from "lucide-react";
import NonWorkdayManager from "@/components/provider/NonWorkdayManager";
import TeamManager from "@/components/provider/TeamManager";

interface TeamMember {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  provider_permission: string | null;
  temporary_password: string | null;
}

export default function Settings() {
  const { user, profile, tenantId, refreshProfile } = useAuth();

  // Company form state
  const [companyName, setCompanyName] = useState("");
  const [cui, setCui] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [currency, setCurrency] = useState("RON");
  const [savingCompany, setSavingCompany] = useState(false);

  // Team state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [maxSeats, setMaxSeats] = useState(2);
  const [subscriptionTier, setSubscriptionTier] = useState("free");
  const [loadingTeam, setLoadingTeam] = useState(true);

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePermission, setInvitePermission] = useState("field_staff");
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ email: string; password: string } | null>(null);

  // Load company info from profile
  useEffect(() => {
    if (profile) {
      setCompanyName((profile as any).company_name || "");
      setCui((profile as any).cui || "");
      setContactEmail((profile as any).contact_email || profile.email || "");
      setContactPhone((profile as any).contact_phone || profile.phone || "");
    }
  }, [profile]);

  // Tenant invite state
  const [uniqueTenantId, setUniqueTenantId] = useState<string | null>(null);

  // Load team members and tenant info
  useEffect(() => {
    if (!tenantId) return;
    loadTeam();
    loadTenant();
  }, [tenantId]);

  const loadTeam = async () => {
    if (!tenantId) return;
    setLoadingTeam(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, user_id, full_name, email, provider_permission, temporary_password")
      .eq("tenant_id", tenantId);
    if (data) setTeamMembers(data as TeamMember[]);
    setLoadingTeam(false);
  };

  const loadTenant = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("tenants")
      .select("max_provider_seats, subscription_tier, unique_tenant_id, currency")
      .eq("id", tenantId)
      .single();
    if (data) {
      setMaxSeats(data.max_provider_seats);
      setSubscriptionTier(data.subscription_tier);
      setUniqueTenantId(data.unique_tenant_id || null);
      setCurrency((data as any).currency || "RON");
    }
  };

  const handleSaveCompany = async () => {
    if (!user) return;
    setSavingCompany(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        company_name: companyName || null,
        cui: cui || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
      } as any)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Failed to save company information");
    } else {
      toast.success("Company information updated");
      refreshProfile();
    }
    setSavingCompany(false);
  };

  const handleInvite = async () => {
    if (!inviteEmail || !inviteName) {
      toast.error("Please fill in all fields");
      return;
    }
    setInviting(true);
    setInviteResult(null);

    const { data, error } = await supabase.functions.invoke("invite-team-member", {
      body: { email: inviteEmail, full_name: inviteName, permission: invitePermission },
    });

    if (error || data?.error) {
      const msg = data?.message || data?.error || error?.message || "Failed to invite";
      if (data?.error === "seat_limit_reached") {
        toast.error(msg);
      } else {
        toast.error(msg);
      }
    } else {
      setInviteResult({ email: data.email, password: data.temporary_password });
      toast.success("Team member invited successfully");
      loadTeam();
    }
    setInviting(false);
  };

  const handleUpdatePermission = async (memberId: string, memberUserId: string, newPermission: string) => {
    if (memberUserId === user?.id) {
      toast.error("You cannot change your own permission level");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ provider_permission: newPermission } as any)
      .eq("id", memberId);
    if (error) {
      toast.error("Failed to update permission");
    } else {
      toast.success("Permission updated");
      loadTeam();
    }
  };

  const seatLimitReached = teamMembers.length >= maxSeats;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your company profile, team members, and integrations.</p>
      </div>

      {/* Company Information */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>Company Information</CardTitle>
          </div>
          <CardDescription>Update your company details visible across the CRM.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Your Company Ltd." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cui">CUI (Tax ID)</Label>
              <Input id="cui" value={cui} onChange={(e) => setCui(e.target.value)} placeholder="RO12345678" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input id="contactEmail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@company.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Contact Phone</Label>
              <Input id="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+40 700 000 000" />
            </div>
          </div>
          <Button className="mt-4" onClick={handleSaveCompany} disabled={savingCompany}>
            {savingCompany ? "Saving…" : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      {/* Client Invite Link */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <CardTitle>Client Invite Link</CardTitle>
          </div>
          <CardDescription>Share this Tenant ID or link with clients so they can connect their properties to you.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Your Tenant ID</Label>
            <div className="flex items-center gap-2">
              <Input value={uniqueTenantId || "Loading…"} readOnly className="font-mono" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (uniqueTenantId) {
                    navigator.clipboard.writeText(uniqueTenantId);
                    toast.success("Tenant ID copied!");
                  }
                }}
                disabled={!uniqueTenantId}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Invite Link</Label>
            <div className="flex items-center gap-2">
              <Input
                value={uniqueTenantId ? `${window.location.origin}/auth?connect=${uniqueTenantId}` : "Loading…"}
                readOnly
                className="text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  if (uniqueTenantId) {
                    navigator.clipboard.writeText(`${window.location.origin}/auth?connect=${uniqueTenantId}`);
                    toast.success("Invite link copied!");
                  }
                }}
                disabled={!uniqueTenantId}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Clients who open this link will be prompted to sign up or log in, then choose which properties to connect to your account.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Team Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>Team Management</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {teamMembers.length} / {maxSeats} seats • {subscriptionTier}
              </Badge>
              <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) { setInviteResult(null); setInviteEmail(""); setInviteName(""); setInvitePermission("field_staff"); } }}>
                <DialogTrigger asChild>
                  <Button size="sm" disabled={seatLimitReached}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  {!inviteResult ? (
                    <>
                      <DialogHeader>
                        <DialogTitle>Invite Team Member</DialogTitle>
                        <DialogDescription>
                          {seatLimitReached
                            ? "You've reached your seat limit. Upgrade your plan to add more members."
                            : "Add a new team member to your organization."}
                        </DialogDescription>
                      </DialogHeader>
                      {!seatLimitReached && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Full Name</Label>
                            <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="John Doe" />
                          </div>
                          <div className="space-y-2">
                            <Label>Email</Label>
                            <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="john@company.com" />
                          </div>
                          <div className="space-y-2">
                            <Label>Permission Level</Label>
                            <Select value={invitePermission} onValueChange={setInvitePermission}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="full_admin">
                                  <div className="flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4" />
                                    Full Admin — Complete CRM access
                                  </div>
                                </SelectItem>
                                <SelectItem value="field_staff">
                                  <div className="flex items-center gap-2">
                                    <Shield className="h-4 w-4" />
                                    Field Staff — Visits & Inspections only
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                      <DialogFooter>
                        {!seatLimitReached && (
                          <Button onClick={handleInvite} disabled={inviting}>
                            {inviting ? "Inviting…" : "Send Invite"}
                          </Button>
                        )}
                      </DialogFooter>
                    </>
                  ) : (
                    <>
                      <DialogHeader>
                        <DialogTitle>Member Created Successfully</DialogTitle>
                        <DialogDescription>Share these credentials securely with the new team member.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 rounded-lg border bg-muted/50 p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Email</span>
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-medium">{inviteResult.email}</code>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(inviteResult.email); toast.success("Copied"); }}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Temporary Password</span>
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-medium">{inviteResult.password}</code>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(inviteResult.password); toast.success("Copied"); }}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        The user should change their password after first login.
                      </p>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setInviteOpen(false)}>Done</Button>
                      </DialogFooter>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <CardDescription>Manage your team members and their permission levels.</CardDescription>
        </CardHeader>
        <CardContent>
          {seatLimitReached && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
              <div className="text-sm">
                <p className="font-medium text-destructive">Seat limit reached</p>
                <p className="text-muted-foreground">
                  Your <strong>{subscriptionTier}</strong> plan allows {maxSeats} provider seats. Contact support to upgrade.
                </p>
              </div>
            </div>
          )}
          {loadingTeam ? (
            <div className="text-muted-foreground text-sm">Loading team…</div>
          ) : (
            <div className="space-y-2">
              {teamMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {member.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "?"}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{member.full_name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.user_id === user?.id ? (
                      <Badge variant="secondary" className="text-xs">You</Badge>
                    ) : null}
                    <Select
                      value={member.provider_permission || "full_admin"}
                      onValueChange={(val) => handleUpdatePermission(member.id, member.user_id, val)}
                      disabled={member.user_id === user?.id}
                    >
                      <SelectTrigger className="w-[140px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full_admin">Full Admin</SelectItem>
                        <SelectItem value="field_staff">Field Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Teams */}
      <TeamManager tenantId={tenantId} />

      {/* Workday Settings */}
      <NonWorkdayManager tenantId={tenantId} />

      {/* Connected Services — Placeholder */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" />
            <CardTitle>Connected Services</CardTitle>
          </div>
          <CardDescription>Connect external services to enhance your CRM workflow.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                <Mail className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Google Services</p>
                <p className="text-xs text-muted-foreground">Gmail & Calendar — Send emails and sync visits</p>
              </div>
            </div>
            <Button variant="outline" size="sm" disabled>
              Coming Soon
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
