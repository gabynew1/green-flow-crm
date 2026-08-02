import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Props {
  contractId: string | null;
  contractName?: string;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}

/**
 * Cancels a contract that has not started yet (DRAFT / SENT_TO_CLIENT / SIGNED).
 * Sets status to REJECTED and stores the reason in rejection_comment.
 * Active contracts must use CloseContractDialog instead (visits + audit trail).
 */
export function CancelContractDialog({ contractId, contractName, onOpenChange, onCancelled }: Props) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCancel = async () => {
    if (!contractId) return;
    setSaving(true);
    const { error } = await supabase
      .from("contracts")
      .update({ status: "REJECTED", rejection_comment: reason.trim() || "Cancelled by provider" } as any)
      .eq("id", contractId);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Contract cancelled");
    setReason("");
    onOpenChange(false);
    onCancelled();
  };

  return (
    <Dialog open={!!contractId} onOpenChange={(o) => { if (!o) setReason(""); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel contract{contractName ? ` — ${contractName}` : ""}?</DialogTitle>
          <DialogDescription>
            The contract has not started, so no visits or invoices are affected. It stays on record as cancelled
            and can be reverted to draft later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">Reason (optional)</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Client changed their mind"
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Keep contract</Button>
          <Button variant="destructive" onClick={handleCancel} disabled={saving}>
            {saving ? "Cancelling…" : "Cancel contract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}