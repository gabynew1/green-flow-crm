import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub as string;

    // Check super admin
    const { data: isSuperAdmin } = await supabaseAdmin.rpc("is_super_admin", { _user_id: userId });
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Only super admin can create invites" }), { status: 403, headers: corsHeaders });
    }

    const { tenantName, role, tenantId } = await req.json();

    let finalTenantId = tenantId;

    // Create tenant if no tenantId provided
    if (!finalTenantId) {
      const { data: tenant, error: tenantErr } = await supabaseAdmin
        .from("tenants")
        .insert({ name: tenantName || "New Tenant", created_by: userId })
        .select("id")
        .single();
      if (tenantErr) throw tenantErr;
      finalTenantId = tenant.id;
    }

    // Create invite
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("provider_invites")
      .insert({
        tenant_id: finalTenantId,
        created_by: userId,
        role: role || "PROVIDER_STAFF",
      })
      .select("token, expires_at")
      .single();
    if (inviteErr) throw inviteErr;

    return new Response(JSON.stringify({ token: invite.token, tenantId: finalTenantId, expiresAt: invite.expires_at }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
