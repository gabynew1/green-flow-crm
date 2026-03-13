import { useState } from "react";
import { Kanban, ClipboardCheck, FileOutput, FileText, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import PipelineKanban from "@/components/provider/PipelineKanban";
import PipelineCreateMenu from "@/components/provider/PipelineCreateMenu";
import Inspections from "./Inspections";
import Offers from "./Offers";
import Contracts from "./Contracts";

type Tab = "kanban" | "opportunities" | "inspections" | "offers" | "contracts";

export default function SalesPipeline() {
  const [tab, setTab] = useState<Tab>("kanban");

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "kanban", label: "Pipeline", icon: Kanban },
    { key: "opportunities", label: "Opportunities", icon: Lightbulb },
    { key: "inspections", label: "Inspections", icon: ClipboardCheck },
    { key: "offers", label: "Offers", icon: FileOutput },
    { key: "contracts", label: "Contracts", icon: FileText },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your opportunities from inspection to contract</p>
        </div>
        <PipelineCreateMenu />
      </div>

      <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? "default" : "ghost"}
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setTab(t.key)}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </Button>
        ))}
      </div>

      {tab === "kanban" && <PipelineKanban />}
      {tab === "opportunities" && <Inspections embedded statusFilter="DRAFT" />}
      {tab === "inspections" && <Inspections embedded />}
      {tab === "offers" && <Offers embedded />}
      {tab === "contracts" && <Contracts embedded />}
    </div>
  );
}