import { useState } from "react";
import { Plus, Lightbulb, FileOutput, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CreateOpportunityDialog from "./CreateOpportunityDialog";
import CreatePipelineItemDialog from "./CreatePipelineItemDialog";

export default function PipelineCreateMenu() {
  const [opportunityOpen, setOpportunityOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [contractOpen, setContractOpen] = useState(false);

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
            Opportunity
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOfferOpen(true)}>
            <FileOutput className="h-4 w-4 mr-2" />
            Offer
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setContractOpen(true)}>
            <FileText className="h-4 w-4 mr-2" />
            Contract
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOpportunityDialog open={opportunityOpen} onOpenChange={setOpportunityOpen} />
      <CreatePipelineItemDialog open={offerOpen} onOpenChange={setOfferOpen} type="offer" />
      <CreatePipelineItemDialog open={contractOpen} onOpenChange={setContractOpen} type="contract" />
    </>
  );
}