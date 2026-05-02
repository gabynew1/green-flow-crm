import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ExternalLink } from "lucide-react";

export type EmailHistoryRow = {
  message_id: string;
  template_name: string;
  category: string | null;
  status: string;
  recipient_email: string;
  error_message: string | null;
  created_at: string;
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  sent: "default",
  pending: "secondary",
  suppressed: "outline",
  failed: "destructive",
  dlq: "destructive",
  bounced: "destructive",
  complained: "destructive",
};

export function EmailHistoryTable({
  rows,
  loading,
  showRecipient = false,
}: {
  rows: EmailHistoryRow[];
  loading?: boolean;
  showRecipient?: boolean;
}) {
  if (loading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (rows.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">No emails yet.</div>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Subject / template</TableHead>
          <TableHead>Category</TableHead>
          {showRecipient && <TableHead>To</TableHead>}
          <TableHead>Status</TableHead>
          <TableHead className="text-right">View</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.message_id}>
            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
              {new Date(r.created_at).toLocaleString()}
            </TableCell>
            <TableCell className="font-medium">{r.template_name}</TableCell>
            <TableCell>
              {r.category ? <Badge variant="outline" className="text-xs">{r.category}</Badge> : "—"}
            </TableCell>
            {showRecipient && <TableCell className="text-xs">{r.recipient_email}</TableCell>}
            <TableCell>
              <Badge variant={STATUS_VARIANT[r.status] || "outline"} className="text-xs">
                {r.status}
              </Badge>
              {r.error_message && r.status !== "sent" && (
                <div className="text-[10px] text-muted-foreground mt-1 max-w-[200px] truncate" title={r.error_message}>
                  {r.error_message}
                </div>
              )}
            </TableCell>
            <TableCell className="text-right">
              {r.status === "sent" || r.status === "pending" ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/emails/view/${encodeURIComponent(r.message_id)}`}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}