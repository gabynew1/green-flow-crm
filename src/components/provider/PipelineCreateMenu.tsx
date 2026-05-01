import { useState } from "react";
import { Plus, Lightbulb, ClipboardCheck, FileOutput, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const [opportunityOpen, setOpportunityOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);

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
          <DropdownMenuItem onClick={() => setInspectionOpen(true)}>
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Inspection
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOfferOpen(true)}>
            <FileOutput className="h-4 w-4 mr-2" />
            Offer
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate("/provider/contracts/new")}>
            <FileText className="h-4 w-4 mr-2" />
            Contract
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOpportunityDialog open={opportunityOpen} onOpenChange={setOpportunityOpen} />
      <CreatePipelineItemDialog open={inspectionOpen} onOpenChange={setInspectionOpen} type="inspection" />
      <CreatePipelineItemDialog open={offerOpen} onOpenChange={setOfferOpen} type="offer" />
    </>
  );
}
