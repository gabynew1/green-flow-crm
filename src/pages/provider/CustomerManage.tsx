import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Unlink, Trash2, AlertTriangle, Pencil, Save } from "lucide-react";
import { toast } from "sonner";

type ActionType = "DELINKED" | "DELETED" | null;

export default function CustomerManage() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<any>(null);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [confirmName, setConfirmName] = useState("");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contact_person_name: "",
    email: "",
    phone: "",
    company_name: "",
  });

  useEffect(() => {
    supabase
      .from("customers")
      .select("*")
      .eq("id", customerId!)
      .single()
      .then(({ data }) => {
        setCustomer(data);
        if (data) {
          setForm({
            name: data.name ?? "",
            contact_person_name: data.contact_person_name ?? "",
            email: data.email ?? "",
            phone: data.phone ?? "",
            company_name: data.company_name ?? "",
          });
        }
      });
  }, [customerId]);

  const handleSaveDetails = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contact_person_name: form.contact_person_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      company_name: form.company_name.trim() || null,
    };
    const { error } = await supabase
      .from("customers")
      .update(payload as any)
      .eq("id", customerId!);
    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }
    // Also update linked profile (SSOT) if one exists so changes stick.
    const { data: linkedProfiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("customer_id", customerId!);
    if (linkedProfiles && linkedProfiles.length > 0) {
      await supabase
        .from("profiles")
        .update({
          full_name: payload.contact_person_name ?? payload.name,
          email: payload.email,
          phone: payload.phone,
        } as any)
        .eq("customer_id", customerId!);
    }
    setSaving(false);
    setEditing(false);
    setCustomer({ ...customer, ...payload });
    toast.success("Account details updated");
  };

  const isConfirmed =
    customer && confirmName.trim().toLowerCase() === customer.name.trim().toLowerCase();

  const handleConfirm = async () => {
    if (!isConfirmed || !actionType) return;
    setLoading(true);
    const { error } = await supabase
      .from("customers")
      .update({ status: actionType } as any)
      .eq("id", customerId!);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      actionType === "DELINKED"
        ? "Customer has been delinked"
        : "Customer has been deleted"
    );
    navigate("/provider/customers");
  };

  if (!customer)
    return (
      <div className="p-8 text-center text-muted-foreground">Loading…</div>
    );

  const actionLabels: Record<string, { title: string; description: string; buttonLabel: string }> = {
    DELINKED: {
      title: "Delink Customer",
      description:
        "This will mark the customer as delinked. They will no longer appear in your active customer list but their data will be preserved.",
      buttonLabel: "Confirm Delink",
    },
    DELETED: {
      title: "Delete Customer",
      description:
        "This will permanently hide the customer from all lists. Their data will be preserved in the database but they will no longer be visible anywhere.",
      buttonLabel: "Confirm Delete",
    },
  };

  const currentAction = actionType ? actionLabels[actionType] : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/provider/customers/${customerId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Manage Account</h1>
        <span className="text-muted-foreground">— {customer.name}</span>
      </div>

      <Card className="max-w-2xl">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Pencil className="h-4 w-4" /> Account Details
            </CardTitle>
            <CardDescription>
              Edit name, contact person, email, phone or company.
            </CardDescription>
          </div>
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={form.name}
                disabled={!editing}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Contact person</Label>
              <Input
                value={form.contact_person_name}
                disabled={!editing}
                onChange={(e) =>
                  setForm({ ...form, contact_person_name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                disabled={!editing}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                disabled={!editing}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Company</Label>
              <Input
                value={form.company_name}
                disabled={!editing}
                onChange={(e) =>
                  setForm({ ...form, company_name: e.target.value })
                }
              />
            </div>
          </div>
          {editing && (
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setForm({
                    name: customer.name ?? "",
                    contact_person_name: customer.contact_person_name ?? "",
                    email: customer.email ?? "",
                    phone: customer.phone ?? "",
                    company_name: customer.company_name ?? "",
                  });
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveDetails} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 max-w-2xl">
        <Card className="border-orange-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Unlink className="h-4 w-4" /> Delink Customer
            </CardTitle>
            <CardDescription>
              Remove customer from your active list. Data is preserved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full border-orange-500/50 text-orange-600 hover:bg-orange-500/10"
              onClick={() => {
                setActionType("DELINKED");
                setConfirmName("");
              }}
            >
              Delink
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-4 w-4" /> Delete Customer
            </CardTitle>
            <CardDescription>
              Permanently hide customer from all views. Data is preserved in DB.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                setActionType("DELETED");
                setConfirmName("");
              }}
            >
              Delete
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <Dialog
        open={actionType !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActionType(null);
            setConfirmName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {currentAction?.title}
            </DialogTitle>
            <DialogDescription>{currentAction?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>
              Type <span className="font-semibold">"{customer.name}"</span> to
              confirm
            </Label>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={customer.name}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setActionType(null);
                setConfirmName("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!isConfirmed || loading}
              onClick={handleConfirm}
            >
              {loading ? "Processing…" : currentAction?.buttonLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
