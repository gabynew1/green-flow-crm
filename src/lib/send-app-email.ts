import { supabase } from "@/integrations/supabase/client";

/**
 * Send a transactional email via the send-transactional-email Edge Function.
 * Fire-and-forget — errors are logged but never block the UI.
 */
export async function sendAppEmail(params: {
  templateName: string;
  recipientEmail: string;
  idempotencyKey: string;
  templateData?: Record<string, unknown>;
  tenantId?: string | null;
}) {
  try {
    await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: params.templateName,
        recipientEmail: params.recipientEmail,
        idempotencyKey: params.idempotencyKey,
        templateData: params.templateData ?? {},
        tenantId: params.tenantId ?? null,
      },
    });
  } catch (err) {
    console.error("[sendAppEmail] Failed to send email", params.templateName, err);
  }
}
