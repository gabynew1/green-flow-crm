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

export default function ChangePassword() {
  const { user, refreshProfile } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!PASSWORD_REGEX.test(newPassword)) {
      toast.error("Password must be at least 6 characters, with 1 uppercase letter and 1 number");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error("Failed to update password: " + error.message);
      setSaving(false);
      return;
    }

    // Clear temporary_password
    await supabase
      .from("profiles")
      .update({ temporary_password: null } as any)
      .eq("user_id", user.id);

    toast.success("Password updated successfully!");
    await refreshProfile();
    setSaving(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Change Your Password</CardTitle>
          <CardDescription>
            You're using a temporary password. Please set a new password to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 chars, 1 uppercase, 1 number"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? "Updating…" : "Set New Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
