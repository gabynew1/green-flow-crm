import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, RotateCw, Trash2, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type DLQRow = {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: any;
};

function DLQList({ queue }: { queue: "auth_emails" | "transactional_emails" }) {
  const [actingId, setActingId] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ["dlq", queue],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_dlq", {
        p_queue: queue, p_limit: 100,
      });
      if (error) throw error;
      return (data ?? []) as DLQRow[];
    },
  });

  async function act(action: "replay_dlq" | "discard_dlq", msgId: number) {
    setActingId(msgId);
    try {
      const { error } = await supabase.functions.invoke("admin-email-ops", {
        body: { action, queue, msg_id: msgId },
      });
      if (error) throw error;
      toast({
        title: action === "replay_dlq" ? "Replayed" : "Discarded",
        description: `Message ${msgId}`,
      });
      q.refetch();
    } catch (e: any) {
      toast({ title: "Action failed", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setActingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{queue} dead-letter ({q.data?.length ?? 0})</CardTitle>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Msg ID</TableHead>
              <TableHead>Reads</TableHead>
              <TableHead>Enqueued</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
              </TableCell></TableRow>
            )}
            {!q.isLoading && (q.data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                Dead-letter queue is empty.
              </TableCell></TableRow>
            )}
            {(q.data ?? []).map((r) => (
              <TableRow key={r.msg_id}>
                <TableCell className="font-mono text-xs">{r.msg_id}</TableCell>
                <TableCell>{r.read_ct}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(r.enqueued_at).toLocaleString()}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.message?.template ?? r.message?.template_name ?? "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {r.message?.to ?? r.message?.recipient_email ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="ghost"
                      disabled={actingId === r.msg_id}
                      onClick={() => act("replay_dlq", r.msg_id)}
                      title="Replay">
                      {actingId === r.msg_id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <RotateCw className="h-4 w-4" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" title="Discard">
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Discard message?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes message {r.msg_id} from the
                            dead-letter queue. The action is logged.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => act("discard_dlq", r.msg_id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Discard
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function EmailDLQTab() {
  return (
    <Tabs defaultValue="transactional_emails" className="space-y-4">
      <TabsList>
        <TabsTrigger value="transactional_emails">Transactional</TabsTrigger>
        <TabsTrigger value="auth_emails">Auth</TabsTrigger>
      </TabsList>
      <TabsContent value="transactional_emails">
        <DLQList queue="transactional_emails" />
      </TabsContent>
      <TabsContent value="auth_emails">
        <DLQList queue="auth_emails" />
      </TabsContent>
    </Tabs>
  );
}