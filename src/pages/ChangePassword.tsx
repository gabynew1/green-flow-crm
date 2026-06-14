import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock, Eye, EyeOff } from "lucide-react";

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{6,}$/;

export default function ChangePassword() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

    // 1. Clear temporary_password FIRST so route guard won't loop
    //    (trigger keeps password_reset_pending in sync)
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ temporary_password: null })
      .eq("user_id", user.id);

    if (updateErr) {
      console.error("Failed to clear temporary_password:", updateErr);
    }

    // 2. Refresh profile so React state reflects cleared value
    await refreshProfile();

    // 3. Now update auth password (triggers onAuthStateChange, but profile is already clean)
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error("Failed to update password: " + error.message);
      setSaving(false);
      return;
    }

    toast.success("Password updated successfully!");
    setSaving(false);
    navigate("/", { replace: true });
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
              <div className="relative">
                <Input
                  id="newPassword"
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
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your new password"
                  required
                  className="pr-10"
                />
                {eyeButton(showConfirm, () => setShowConfirm(!showConfirm))}
              </div>
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
