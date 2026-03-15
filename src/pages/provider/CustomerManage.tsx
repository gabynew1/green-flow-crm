import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Unlink, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type ActionType = "DELINKED" | "DELETED" | null;

export default function CustomerManage() {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<any>(null);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [confirmName, setConfirmName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase
      .from("customers")
      .select("*")
      .eq("id", customerId!)
      .single()
      .then(({ data }) => setCustomer(data));
  }, [customerId]);

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
