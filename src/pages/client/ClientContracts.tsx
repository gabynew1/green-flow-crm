import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, X, FileText, Search, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const statusColors: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PENDING_NEW: "outline",
  ACTIVE: "default",
  PAUSED: "secondary",
  TERMINATED: "destructive",
  REJECTED: "destructive",
};

const statusLabels: Record<string, string> = {
  PENDING_NEW: "Pending Approval",
  REJECTED: "Rejected",
  ACTIVE: "Active",
  PAUSED: "Paused",
  TERMINATED: "Terminated",
  DRAFT: "Draft",
};

const billingLabels: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  ONE_TIME: "Ad hoc",
};

type FilterTab = "all" | "pending" | "active" | "archived";

const MAX_REJECTION_WORDS = 100;

export default function ClientContracts() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  useEffect(() => { if (user) load(); }, [user]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("contracts")
      .select("*, properties(name)")
      .order("created_at", { ascending: false });
    setContracts(data ?? []);
    setLoading(false);
  };

  const handleApprove = async (contractId: string) => {
    const { error } = await supabase
      .from("contracts")
      .update({ status: "ACTIVE" as any })
      .eq("id", contractId);
    if (error) { toast.error(error.message); return; }
    toast.success("Contract approved!");
    load();
  };

  const handleReject = async () => {
    if (!rejectingId) return;
    const wordCount = rejectComment.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > MAX_REJECTION_WORDS) {
      toast.error(`Comment must be ${MAX_REJECTION_WORDS} words or fewer`);
      return;
    }
    const { error } = await supabase
      .from("contracts")
      .update({ status: "REJECTED" as any, rejection_comment: rejectComment.trim() || null } as any)
      .eq("id", rejectingId);
    if (error) { toast.error(error.message); return; }
    toast.success("Contract rejected");
    setRejectingId(null);
    setRejectComment("");
    load();
  };

  const wordCount = rejectComment.trim().split(/\s+/).filter(Boolean).length;

  const filtered = useMemo(() => {
    let list = contracts;

    if (filterTab === "pending") list = list.filter(c => c.status === "PENDING_NEW");
    else if (filterTab === "active") list = list.filter(c => c.status === "ACTIVE" || c.status === "PAUSED");
    else if (filterTab === "archived") list = list.filter(c => c.status === "REJECTED" || c.status === "TERMINATED");

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.contract_name?.toLowerCase().includes(q) ||
        (c.properties as any)?.name?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [contracts, filterTab, search]);

  const counts = useMemo(() => ({
    all: contracts.length,
    pending: contracts.filter(c => c.status === "PENDING_NEW").length,
    active: contracts.filter(c => c.status === "ACTIVE" || c.status === "PAUSED").length,
    archived: contracts.filter(c => c.status === "REJECTED" || c.status === "TERMINATED").length,
  }), [contracts]);

  const isExpiringSoon = (endDate: string | null) => {
    if (!endDate) return false;
    return differenceInDays(new Date(endDate), new Date()) <= 30 && differenceInDays(new Date(endDate), new Date()) >= 0;
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "pending", label: `Pending (${counts.pending})` },
    { key: "active", label: `Active (${counts.active})` },
    { key: "archived", label: `Archived (${counts.archived})` },
  ];

  const renderContractCard = (c: any) => {
    const showActions = c.status === "PENDING_NEW";
    const expiring = isExpiringSoon(c.end_date) && (c.status === "ACTIVE" || c.status === "PAUSED");

    return (
      <Link key={c.id} to={`/client/contracts/${c.id}`} className="block">
        <Card className="hover:border-primary/30 transition-colors cursor-pointer">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">{c.contract_name}</p>
                  <p className="text-sm text-muted-foreground">{(c.properties as any)?.name || "—"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(c.start_date), "MMM d, yyyy")} → {c.end_date ? format(new Date(c.end_date), "MMM d, yyyy") : "Ongoing"}
                  </p>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    {c.visit_frequency_count && c.visit_frequency_type && (
                      <span>Visits: {c.visit_frequency_count}x / {c.visit_frequency_type.toLowerCase()}</span>
                    )}
                    <span>Billing: {billingLabels[c.billing_cycle] || c.billing_cycle}</span>
                  </div>
                  {c.rejection_comment && c.status === "REJECTED" && (
                    <p className="text-xs text-destructive mt-2 italic">Your comment: "{c.rejection_comment}"</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                {expiring && (
                  <Badge variant="outline" className="text-[10px] border-warning text-warning gap-1">
                    <AlertTriangle className="h-3 w-3" /> Expiring Soon
                  </Badge>
                )}
                <Badge variant={statusColors[c.status] || "secondary"} className="text-[10px]">
                  {statusLabels[c.status] || c.status}
                </Badge>
                {showActions && (
                  <>
                    <Button size="sm" variant="default" className="h-7 text-xs" onClick={(e) => { e.preventDefault(); handleApprove(c.id); }}>
                      <Check className="h-3 w-3 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={(e) => { e.preventDefault(); setRejectingId(c.id); setRejectComment(""); }}>
                      <X className="h-3 w-3 mr-1" /> Reject
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Contracts</h1>

      {/* Filter tabs + search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 flex-wrap">
          {tabs.map(t => (
            <Button
              key={t.key}
              variant={filterTab === t.key ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterTab(t.key)}
              className="text-xs"
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contracts…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          {contracts.length === 0 ? "No contracts yet" : "No contracts match your filters"}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => renderContractCard(c))}
        </div>
      )}

      {/* Reject Dialog */}
      <Dialog open={!!rejectingId} onOpenChange={(o) => { if (!o) setRejectingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Contract</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Please provide a reason for rejecting this contract (optional, max {MAX_REJECTION_WORDS} words).</p>
            <Textarea value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} placeholder="Reason for rejection…" rows={4} />
            <p className={`text-xs ${wordCount > MAX_REJECTION_WORDS ? "text-destructive" : "text-muted-foreground"}`}>{wordCount} / {MAX_REJECTION_WORDS} words</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setRejectingId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleReject} disabled={wordCount > MAX_REJECTION_WORDS}>Confirm Rejection</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
