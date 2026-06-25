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
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{6,}$/;

export default function ChangePassword() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation("public");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!PASSWORD_REGEX.test(newPassword)) {
      toast.error(t("changePassword.rule"));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t("changePassword.mismatch"));
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
      toast.error(t("changePassword.failure") + error.message);
      setSaving(false);
      return;
    }

    toast.success(t("changePassword.success"));
    setSaving(false);
    navigate("/", { replace: true });
  };

  const eyeButton = (show: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      tabIndex={-1}
      aria-label={show ? t("changePassword.hide") : t("changePassword.show")}
    >
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 bg-background">
      <div className="absolute top-3 right-3"><LanguageSwitcher /></div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">{t("changePassword.title")}</CardTitle>
          <CardDescription>{t("changePassword.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("changePassword.newPassword")}</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("changePassword.newPlaceholder")}
                  required
                  className="pr-10"
                />
                {eyeButton(showNew, () => setShowNew(!showNew))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("changePassword.confirm")}</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("changePassword.confirmPlaceholder")}
                  required
                  className="pr-10"
                />
                {eyeButton(showConfirm, () => setShowConfirm(!showConfirm))}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? t("changePassword.updating") : t("changePassword.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
