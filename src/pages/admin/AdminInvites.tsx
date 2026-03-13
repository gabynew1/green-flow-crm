import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Leaf, Shield } from "lucide-react";

export default function AdminInvites() {
  const [tenantName, setTenantName] = useState("");
  const [role, setRole] = useState<string>("PROVIDER_ADMIN");
  const [inviteLink, setInviteLink] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    if (!tenantName.trim()) {
      toast.error("Enter a tenant name");
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-provider-invite", {
        body: { tenantName, role },
      });
      if (error) throw error;
      const link = `${window.location.origin}/auth?invite=${data.token}`;
      setInviteLink(link);
      toast.success("Invite created!");
    } catch (err: any) {
      toast.error(err.message || "Failed to create invite");
    } finally {
      setIsLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success("Link copied!");
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Super Admin</h1>
            <p className="text-sm text-muted-foreground">Create provider invite links</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>New Provider Invite</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Tenant / Company Name</Label>
              <Input
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="e.g. Green Gardens LLC"
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROVIDER_ADMIN">Provider Admin</SelectItem>
                  <SelectItem value="PROVIDER_STAFF">Provider Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreate} disabled={isLoading} className="w-full">
              {isLoading ? "Creating…" : "Generate Invite Link"}
            </Button>

            {inviteLink && (
              <div className="mt-4 p-3 bg-muted rounded-lg space-y-2">
                <Label className="text-xs text-muted-foreground">Share this link with the provider:</Label>
                <div className="flex gap-2">
                  <Input value={inviteLink} readOnly className="text-xs" />
                  <Button variant="outline" size="icon" onClick={copyLink}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Expires in 7 days</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
