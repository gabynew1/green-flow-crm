import { useState } from "react";
import { Plus, Lightbulb, ClipboardCheck, FileOutput, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CreateOpportunityDialog from "./CreateOpportunityDialog";

export default function PipelineCreateMenu() {
  const [opportunityOpen, setOpportunityOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" /> Create
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setOpportunityOpen(true)}>
            <Lightbulb className="h-4 w-4 mr-2" />
            Create Opportunity
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOpportunityDialog open={opportunityOpen} onOpenChange={setOpportunityOpen} />
    </>
  );
}
