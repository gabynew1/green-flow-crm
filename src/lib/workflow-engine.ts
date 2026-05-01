import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type InspectionStatus = "DRAFT" | "SCHEDULED" | "COMPLETED" | "OFFER_GENERATED";
export type OfferStatus = "DRAFT" | "IN_PROGRESS" | "SENT_TO_CLIENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELED";
export type ContractStatus = "DRAFT" | "SENT_TO_CLIENT" | "SIGNED" | "ACTIVE" | "CLOSED" | "REJECTED";

export const WorkflowEngine = {
    /**
     * Transitions an inspection to a new status.
     */
    async transitionInspection(inspectionId: string, newStatus: InspectionStatus, data: any = {}) {
        const { error } = await supabase
            .from("inspections")
            .update({ status: newStatus, ...data })
            .eq("id", inspectionId);

        if (error) {
            toast.error(`Workflow Error: ${error.message}`);
            throw error;
        }

        return { success: true };
    },

    /**
     * Transitions an offer to a new status.
     */
    async transitionOffer(offerId: string, newStatus: OfferStatus, data: any = {}) {
        const { error } = await supabase
            .from("offers")
            .update({ status: newStatus, ...data })
            .eq("id", offerId);

        if (error) {
            toast.error(`Workflow Error: ${error.message}`);
            throw error;
        }

        // Side effect: If Accepted, we might want to trigger contract generation 
        // or log it. For now, we'll handle the explicit "Accept & Generate" separately.

        return { success: true };
    },

    /**
     * Complex transition: Accept offer and generate a contract.
     */
    async acceptOfferAndGenerateContract(offerId: string, userId: string) {
        // 1. Get offer details and line items
        const { data: offer, error: offerError } = await supabase
            .from("offers")
            .select("*, offer_line_items(*)")
            .eq("id", offerId)
            .single();

        if (offerError || !offer) {
            toast.error("Could not find offer data");
            throw offerError;
        }

        // 2. Update offer status to ACCEPTED
        await this.transitionOffer(offerId, "ACCEPTED");

        // 3. Create contract
        const { data: contract, error: contractError } = await supabase
            .from("contracts")
            .insert({
                contract_name: `Contract - ${offer.offer_name}`,
                property_id: offer.property_id,
                offer_id: offerId,
                start_date: new Date().toISOString().split("T")[0],
                status: "DRAFT",
                tenant_id: offer.tenant_id,
            } as any)
            .select()
            .single();

        if (contractError) {
            toast.error(`Contract Generation Error: ${contractError.message}`);
            throw contractError;
        }

        // 4. Copy line items
        if (offer.offer_line_items && offer.offer_line_items.length > 0) {
            const contractLines = offer.offer_line_items.map((li: any) => ({
                contract_id: contract.id,
                service_catalog_id: li.service_catalog_id,
                custom_name: li.custom_name,
                quantity: li.quantity,
                unit: li.unit,
                notes: li.notes,
                tenant_id: offer.tenant_id,
            }));
            const { error: linesError } = await supabase.from("contract_line_items").insert(contractLines);
            if (linesError) {
                toast.error(`Line Item Copy Error: ${linesError.message}`);
            }
        }

        return { contractId: contract.id };
    },

    /**
     * Complex transition: Complete inspection and generate an offer.
     */
    async completeInspectionAndGenerateOffer(inspectionId: string, userId: string) {
        const { data: inspection, error: inspError } = await supabase
            .from("inspections")
            .select("*")
            .eq("id", inspectionId)
            .single();

        if (inspError || !inspection) {
            toast.error("Could not find inspection data");
            throw inspError;
        }

        // 1. Create offer
        const { data: offer, error: offerError } = await supabase.from("offers").insert({
            inspection_id: inspectionId,
            property_id: inspection.property_id,
            customer_id: inspection.customer_id,
            tenant_id: inspection.tenant_id,
            offer_name: `Offer - ${inspection.title}`,
            notes: inspection.findings || null,
            created_by: userId,
        }).select().single();

        if (offerError) {
            toast.error(`Offer Generation Error: ${offerError.message}`);
            throw offerError;
        }

        // 2. Auto-import the property's inventory items as offer line items
        //    so the offer reflects what was found on site. Prices are left
        //    blank for the provider to fill in.
        const { data: inv } = await supabase
            .from("inventory")
            .select("id")
            .eq("property_id", inspection.property_id)
            .maybeSingle();
        if (inv) {
            const { data: invItems } = await supabase
                .from("inventory_items")
                .select("name, category, quantity, unit, notes")
                .eq("inventory_id", inv.id);
            if (invItems && invItems.length > 0) {
                const lines = invItems.map((it: any) => ({
                    offer_id: offer.id,
                    tenant_id: inspection.tenant_id,
                    custom_name: `${String(it.category).replace(/_/g, " ")} — ${it.name}`,
                    quantity: it.quantity ?? 1,
                    unit: it.unit ?? "count",
                    notes: it.notes ?? null,
                    unit_price: null,
                }));
                const { error: linesError } = await supabase
                    .from("offer_line_items")
                    .insert(lines as any);
                if (linesError) {
                    // Non-fatal: offer is created, inventory import failed.
                    toast.error(`Inventory import warning: ${linesError.message}`);
                }
            }
        }

        // 3. Update inspection status
        await this.transitionInspection(inspectionId, "COMPLETED");

        return { offerId: offer.id };
    }
};
