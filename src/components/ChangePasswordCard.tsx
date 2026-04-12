import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock } from "lucide-react";

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{6,}$/;

export default function ChangePasswordCard() {
  const { user, profile } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile?.email) return;

    if (!PASSWORD_REGEX.test(newPassword)) {
      toast.error("Password must be at least 6 characters, with 1 uppercase letter and 1 number");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setSaving(true);

    // Verify old password
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: oldPassword,
    });
    if (signInErr) {
      toast.error("Current password is incorrect");
      setSaving(false);
      return;
    }

    // Update password
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error("Failed to update password: " + error.message);
    } else {
      toast.success("Password changed successfully!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-primary" />
          <CardTitle>Change Password</CardTitle>
        </div>
        <CardDescription>Update your password. You must know your current password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Enter current password"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="selfNewPassword">New Password</Label>
              <Input
                id="selfNewPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 chars, 1 uppercase, 1 number"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="selfConfirmPassword">Confirm New Password</Label>
              <Input
                id="selfConfirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
              />
            </div>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Changing…" : "Change Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
