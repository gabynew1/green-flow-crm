import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller is authenticated and is PROVIDER_ADMIN
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      data: { user: caller },
    } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller is PROVIDER_ADMIN
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    const isAdmin = callerRoles?.some((r: any) => r.role === "PROVIDER_ADMIN");
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Only provider admins can invite team members" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get caller's tenant
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", caller.id)
      .single();
    if (!callerProfile?.tenant_id) {
      return new Response(
        JSON.stringify({ error: "No tenant found for caller" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const tenantId = callerProfile.tenant_id;

    // Check seat limit
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("max_provider_seats, subscription_tier")
      .eq("id", tenantId)
      .single();
    if (!tenant) {
      return new Response(
        JSON.stringify({ error: "Tenant not found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { count: currentSeats } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    if ((currentSeats ?? 0) >= tenant.max_provider_seats) {
      return new Response(
        JSON.stringify({
          error: "seat_limit_reached",
          message: `Seat limit reached (${tenant.max_provider_seats}). Upgrade your plan to add more team members.`,
          current_tier: tenant.subscription_tier,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse body
    const { email, full_name, permission } = await req.json();
    if (!email || !full_name) {
      return new Response(
        JSON.stringify({ error: "email and full_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const providerPermission = permission === "field_staff" ? "field_staff" : "full_admin";
    const appRole = providerPermission === "full_admin" ? "PROVIDER_ADMIN" : "PROVIDER_STAFF";

    // Generate temporary password
    const tempPassword =
      "Temp" +
      Math.random().toString(36).slice(2, 8) +
      Math.random().toString(36).slice(2, 4).toUpperCase() +
      "!";

    // Create auth user
    const { data: newUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name },
      });

    if (createError) {
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = newUser.user.id;

    // Update profile (auto-created by handle_new_user trigger) with tenant + permission
    await supabaseAdmin
      .from("profiles")
      .update({
        tenant_id: tenantId,
        provider_permission: providerPermission,
        temporary_password: tempPassword,
      })
      .eq("user_id", userId);

    // Replace the default CLIENT_USER role with the provider role
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);

    await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: appRole,
    });

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        email,
        temporary_password: tempPassword,
        permission: providerPermission,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
