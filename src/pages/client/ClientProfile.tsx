import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User, Phone, Mail, Hash, Pencil, Save, X } from "lucide-react";

export default function ClientProfile() {
  const { user, profile, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const startEditing = () => {
    setFullName(profile?.full_name || "");
    setPhone(profile?.phone || "");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), phone: phone.trim() || null })
      .eq("user_id", user.id);

    if (error) {
      toast.error("Failed to update profile");
    } else {
      toast.success("Profile updated!");
      await refreshProfile();
      setEditing(false);
    }
    setSaving(false);
  };

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">My Profile</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Personal Information</CardTitle>
          {!editing && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Full Name */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-muted-foreground">
              <User className="h-4 w-4" /> Full Name
            </Label>
            {editing ? (
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            ) : (
              <p className="text-sm font-medium text-foreground">{profile?.full_name || "—"}</p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="h-4 w-4" /> Phone
            </Label>
            {editing ? (
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
            ) : (
              <p className="text-sm font-medium text-foreground">{profile?.phone || "—"}</p>
            )}
          </div>

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-muted-foreground">
              <Mail className="h-4 w-4" /> Email
            </Label>
            <p className="text-sm font-medium text-foreground">{profile?.email || "—"}</p>
          </div>

          {/* Unique Client Number (read-only) */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-muted-foreground">
              <Hash className="h-4 w-4" /> Unique Client Number
            </Label>
            <p className="text-sm font-mono font-semibold text-foreground">{profile?.unique_client_id || "—"}</p>
          </div>

          {editing && (
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="gap-1">
                <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save"}
              </Button>
              <Button variant="outline" onClick={cancelEditing} disabled={saving}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
