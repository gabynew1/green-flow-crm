import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  closeContractWithCleanup,
  countFutureVisitsForContract,
  getTenantTimezone,
} from "@/lib/contracts";

interface CloseContractDialogProps {
  contractId: string | null;
  tenantId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed?: () => void;
}

export function CloseContractDialog({
  contractId,
  tenantId,
  open,
  onOpenChange,
  onClosed,
}: CloseContractDialogProps) {
  const [reason, setReason] = useState("");
  const [futureCount, setFutureCount] = useState<number | null>(null);
  const [today, setToday] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !contractId || !tenantId) return;
    setReason("");
    setFutureCount(null);
    let cancelled = false;
    (async () => {
      try {
        const tz = await getTenantTimezone(tenantId);
        const { count, today: t } = await countFutureVisitsForContract(contractId, tz);
        if (cancelled) return;
        setFutureCount(count);
        setToday(t);
      } catch (err: any) {
        if (!cancelled) toast.error(err?.message || "Failed to load future visits");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contractId, tenantId]);

  const canConfirm = reason.trim().length > 0 && !submitting && futureCount !== null;

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!contractId || !canConfirm) return;
    setSubmitting(true);
    try {
      const result = await closeContractWithCleanup(contractId, reason);
      if (result.already_closed) {
        toast.info("Contract was already closed.");
      } else {
        toast.success(
          `Contract closed. ${result.canceled_count} future visit(s) cancelled. Contract ends on ${result.closed_on}.`
        );
      }
      onOpenChange(false);
      onClosed?.();
    } catch (err: any) {
      toast.error(err?.message || "Failed to close contract");
    } finally {
      setSubmitting(false);
    }
  };

  const message =
    futureCount === null
      ? "Loading…"
      : `Closing will end this contract on ${today}. ${futureCount} future visit(s) scheduled after today will be cancelled. A cancellation reason is required. Continue?`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Contract closed</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancellation-reason">Cancellation reason</Label>
          <Textarea
            id="cancellation-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this contract being closed?"
            rows={3}
            autoFocus
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting ? "Closing…" : "Close contract"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}