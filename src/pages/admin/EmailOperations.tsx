import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Activity, AlertTriangle, HeartPulse } from "lucide-react";
import EmailActivityTab from "@/components/admin/email-ops/EmailActivityTab";
import EmailDLQTab from "@/components/admin/email-ops/EmailDLQTab";
import EmailHealthTab from "@/components/admin/email-ops/EmailHealthTab";

export default function EmailOperations() {
  const [tab, setTab] = useState("activity");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Operations</h1>
          <p className="text-sm text-muted-foreground">
            Monitor delivery, replay failed messages, and check infrastructure health.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="h-4 w-4" /> Activity
          </TabsTrigger>
          <TabsTrigger value="dlq" className="gap-2">
            <AlertTriangle className="h-4 w-4" /> Dead-letter Queue
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-2">
            <HeartPulse className="h-4 w-4" /> Health
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activity"><EmailActivityTab /></TabsContent>
        <TabsContent value="dlq"><EmailDLQTab /></TabsContent>
        <TabsContent value="health"><EmailHealthTab /></TabsContent>
      </Tabs>
    </div>
  );
}