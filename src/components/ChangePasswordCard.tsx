import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Eye, EyeOff } from "lucide-react";

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{6,}$/;

export default function ChangePasswordCard() {
  const { user, profile } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: profile.email,
      password: oldPassword,
    });
    if (signInErr) {
      toast.error("Current password is incorrect");
      setSaving(false);
      return;
    }

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

  const eyeButton = (show: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      tabIndex={-1}
      aria-label={show ? "Hide password" : "Show password"}
    >
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

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
            <div className="relative">
              <Input
                id="currentPassword"
                type={showOld ? "text" : "password"}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Enter current password"
                required
                className="pr-10"
              />
              {eyeButton(showOld, () => setShowOld(!showOld))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="selfNewPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="selfNewPassword"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 chars, 1 uppercase, 1 number"
                  required
                  className="pr-10"
                />
                {eyeButton(showNew, () => setShowNew(!showNew))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="selfConfirmPassword">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="selfConfirmPassword"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  className="pr-10"
                />
                {eyeButton(showConfirm, () => setShowConfirm(!showConfirm))}
              </div>
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
