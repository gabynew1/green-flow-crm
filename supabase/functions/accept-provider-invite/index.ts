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

    const { inviteToken } = await req.json();
    if (!inviteToken) {
      return new Response(JSON.stringify({ error: "Missing invite token" }), { status: 400, headers: corsHeaders });
    }

    // Look up the invite
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("provider_invites")
      .select("*")
      .eq("token", inviteToken)
      .is("used_by", null)
      .single();

    if (inviteErr || !invite) {
      return new Response(JSON.stringify({ error: "Invalid or already used invite" }), { status: 400, headers: corsHeaders });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Invite has expired" }), { status: 400, headers: corsHeaders });
    }

    // Update profile with tenant_id
    await supabaseAdmin
      .from("profiles")
      .update({ tenant_id: invite.tenant_id })
      .eq("user_id", userId);

    // Replace CLIENT_USER role with invite role
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "CLIENT_USER");

    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: invite.role });

    // Mark invite as used
    await supabaseAdmin
      .from("provider_invites")
      .update({ used_by: userId, used_at: new Date().toISOString() })
      .eq("id", invite.id);

    return new Response(JSON.stringify({ success: true, role: invite.role }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: corsHeaders });
  }
});
